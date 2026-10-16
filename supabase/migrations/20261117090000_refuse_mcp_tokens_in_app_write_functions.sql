create function private.refuse_mcp_token()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if auth.jwt() ->> 'client_id' is not null then
    raise exception 'AI clients cannot change decks or the collection.' using errcode = 'insufficient_privilege';
  end if;
end;
$$;

grant execute on function private.refuse_mcp_token() to authenticated;

create or replace function public.add_scan_batch(batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  copies jsonb;
  new_copy_count integer;
  addition public.collection_additions;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  copies := private.check_scan_batch(batch);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('add_scan_batch ' || caller::text, 0));

  select count(*) into new_copy_count
    from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
    where not exists (
      select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
    );

  if new_copy_count = 0 then
    return private.scan_batch_result(caller, addition, copies);
  end if;

  insert into public.collection_additions (user_id, added_at, copy_count, source)
    values (caller, now(), new_copy_count, 'scan_batch')
    returning * into addition;

  with new_copies as (
    select c.*
    from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
    where not exists (
      select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
    )
  ),
  stacks as (
    select n.card_printing_id, n.finish, n.condition, n.language, count(*)::integer as quantity
    from new_copies n
    group by n.card_printing_id, n.finish, n.condition, n.language
  ),
  price_snapshot as (
    select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'prices'
  )
  insert into public.collection_addition_lines (
    addition_id, user_id, card_printing_id, finish, condition, language, quantity,
    purchase_day_usd_cents, price_snapshot_at
  )
  select
    addition.id,
    caller,
    s.card_printing_id,
    s.finish,
    s.condition,
    s.language,
    s.quantity,
    private.finish_price_cents(price, s.finish),
    (select price_snapshot.snapshot_at from price_snapshot)
  from stacks s
  left join public.card_prices price on price.printing_id = s.card_printing_id;

  insert into public.collection_addition_copies (
    user_id, copy_id, addition_id, card_printing_id, finish, condition, language
  )
  select caller, c.copy_id, addition.id, c.card_printing_id, c.finish, c.condition, c.language
  from jsonb_populate_recordset(null::private.scan_batch_copy, copies) c
  where not exists (
    select 1 from public.collection_addition_copies done where done.user_id = caller and done.copy_id = c.copy_id
  );

  insert into public.copies (id, user_id, addition_id, card_printing_id, finish, condition, language)
  select done.copy_id, done.user_id, done.addition_id, done.card_printing_id, done.finish, done.condition, done.language
  from public.collection_addition_copies done
  where done.user_id = caller and done.addition_id = addition.id;

  return private.scan_batch_result(caller, addition, copies);
end;
$$;

create or replace function public.set_copy_protected(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  chosen_copy_id uuid;
  protecting boolean;
  copy_is_free boolean;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  chosen_copy_id := private.checked_copy_id(request, array['protected']);
  if not request ? 'protected' then
    perform private.invalid_argument('protected', 'protected is required.');
  end if;
  protecting := private.checked_boolean('protected', request -> 'protected')::boolean;

  perform 1 from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id for update;
  if not found then
    perform private.raise_copy_not_found();
  end if;

  if protecting then
    select a.is_free into copy_is_free
      from private.collection_availability a
      where a.user_id = caller and a.copy_id = chosen_copy_id;
    if copy_is_free is not true then
      perform private.raise_search_error('copy_not_free', 'Only a free copy can be protected.', 'copy_id');
    end if;
  end if;

  update public.copies copy
    set is_protected = protecting
    where copy.user_id = caller and copy.id = chosen_copy_id;

  return jsonb_build_object('copy_id', chosen_copy_id, 'protected', protecting);
end;
$$;

create or replace function public.delete_copy(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  chosen_copy_id uuid;
  removed public.deck_cards;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  chosen_copy_id := private.checked_copy_id(request);

  removed := private.lock_deck_of_copy(caller, chosen_copy_id);
  if removed.copy_id is not null then
    perform private.remove_from_deck(caller, removed, 'removed_from_collection');
  end if;

  delete from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id;
  if not found then
    perform private.raise_copy_not_found();
  end if;
end;
$$;

create or replace function public.create_user_tag(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  created public.user_tags;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['name']);

  insert into public.user_tags (user_id, name)
    values (caller, checked ->> 'name')
    on conflict (user_id, lower(name)) do nothing
    returning * into created;
  if created.id is null then
    perform private.raise_user_tag_exists();
  end if;

  return jsonb_build_object('user_tag_id', created.id, 'name', created.name);
end;
$$;

create or replace function public.set_copy_user_tag(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_copy_id uuid;
  chosen_user_tag_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  chosen_copy_id := private.checked_copy_id(request, array['user_tag_id', 'tagged']);
  checked := private.check_request(request - 'copy_id', array['user_tag_id', 'tagged']);
  chosen_user_tag_id := (checked ->> 'user_tag_id')::uuid;

  if not exists (select 1 from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id) then
    perform private.raise_copy_not_found();
  end if;
  if not exists (
    select 1 from public.user_tags user_tag where user_tag.user_id = caller and user_tag.id = chosen_user_tag_id
  ) then
    perform private.raise_user_tag_not_found();
  end if;

  if (checked ->> 'tagged')::boolean then
    insert into public.copy_user_tags (user_id, copy_id, user_tag_id)
      values (caller, chosen_copy_id, chosen_user_tag_id)
      on conflict do nothing;
  else
    delete from public.copy_user_tags link
      where link.user_id = caller and link.copy_id = chosen_copy_id and link.user_tag_id = chosen_user_tag_id;
  end if;
end;
$$;

create or replace function public.rename_user_tag(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  renamed public.user_tags;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['user_tag_id', 'name']);

  begin
    update public.user_tags user_tag
      set name = checked ->> 'name'
      where user_tag.user_id = caller and user_tag.id = (checked ->> 'user_tag_id')::uuid
      returning * into renamed;
  exception when unique_violation then
    perform private.raise_user_tag_exists();
  end;
  if renamed.id is null then
    perform private.raise_user_tag_not_found();
  end if;

  return jsonb_build_object('user_tag_id', renamed.id, 'name', renamed.name);
end;
$$;

create or replace function public.delete_user_tag(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['user_tag_id']);

  delete from public.user_tags user_tag
    where user_tag.user_id = caller and user_tag.id = (checked ->> 'user_tag_id')::uuid;
  if not found then
    perform private.raise_user_tag_not_found();
  end if;
end;
$$;

create or replace function public.create_deck(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  created_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['name']);

  insert into public.decks (user_id, name)
    values (caller, checked ->> 'name')
    returning id into created_id;

  return jsonb_build_object('deck_id', created_id);
end;
$$;

create or replace function public.mark_deck_used(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id']);

  update public.decks deck
    set last_used_at = now()
    where deck.user_id = caller and deck.id = (checked ->> 'deck_id')::uuid;
  if not found then
    perform private.raise_deck_not_found();
  end if;
end;
$$;

create or replace function public.rename_deck(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'name']);

  update public.decks deck
    set name = checked ->> 'name', last_used_at = now()
    where deck.user_id = caller and deck.id = (checked ->> 'deck_id')::uuid;
  if not found then
    perform private.raise_deck_not_found();
  end if;
end;
$$;

create or replace function public.set_deck_priority(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'priority']);

  update public.decks deck
    set priority = (checked ->> 'priority')::public.deck_priority, last_used_at = now()
    where deck.user_id = caller and deck.id = (checked ->> 'deck_id')::uuid;
  if not found then
    perform private.raise_deck_not_found();
  end if;
end;
$$;

create or replace function public.delete_deck(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id']);

  delete from public.decks deck
    where deck.user_id = caller and deck.id = (checked ->> 'deck_id')::uuid;
  if not found then
    perform private.raise_deck_not_found();
  end if;
end;
$$;

create or replace function public.add_deck_card(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  chosen_copy public.copies;
  copy_is_free boolean;
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'copy_id', 'unprotect']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;

  perform private.lock_deck(caller, chosen_deck_id);
  select * into chosen_copy
    from public.copies copy
    where copy.user_id = caller and copy.id = (checked ->> 'copy_id')::uuid
    for update;
  if chosen_copy.id is null then
    perform private.raise_copy_not_found();
  end if;

  select a.is_free into copy_is_free
    from private.collection_availability a
    where a.user_id = caller and a.copy_id = chosen_copy.id;
  if not copy_is_free then
    perform private.raise_search_error('copy_not_free', 'Only a free copy can go into a deck.', 'copy_id');
  end if;
  if chosen_copy.is_protected then
    if not (checked ->> 'unprotect')::boolean then
      perform private.raise_search_error(
        'copy_protected',
        'copy_id is a protected copy. Send unprotect: true to unprotect it and add it.',
        'copy_id'
      );
    end if;
    update public.copies copy set is_protected = false where copy.user_id = caller and copy.id = chosen_copy.id;
  end if;

  insert into public.deck_cards (user_id, deck_id, copy_id) values (caller, chosen_deck_id, chosen_copy.id);
  change_id := private.record_deck_change(caller, chosen_deck_id, 'added');
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    values (caller, change_id, chosen_copy.id, chosen_copy.card_printing_id, chosen_copy.finish, null, 'main');
  perform private.save_deck_evaluation(caller, chosen_deck_id);

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

create or replace function public.set_deck_commander(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_copy public.copies;
  chosen_deck_id uuid;
  deck_card public.deck_cards;
  commander boolean;
  commander_count integer;
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['copy_id', 'commander']);
  commander := (checked ->> 'commander')::boolean;

  deck_card := private.lock_deck_card(caller, (checked ->> 'copy_id')::uuid);
  chosen_deck_id := deck_card.deck_id;
  select * into chosen_copy from public.copies copy where copy.user_id = caller and copy.id = deck_card.copy_id;

  if commander and deck_card.commander_at is null then
    select count(*) into commander_count
      from public.deck_cards card
      where card.user_id = caller and card.deck_id = chosen_deck_id and card.commander_at is not null;
    if commander_count >= 2 then
      perform private.raise_search_error('commander_limit', 'A deck has at most two commanders.', 'commander');
    end if;
    update public.deck_cards card set commander_at = now()
      where card.user_id = caller and card.copy_id = chosen_copy.id;
    change_id := private.record_deck_change(
      caller,
      chosen_deck_id,
      case when commander_count = 0 then 'made_commander' else 'made_partner' end::public.deck_change_kind
    );
  elsif not commander and deck_card.commander_at is not null then
    update public.deck_cards card set commander_at = null
      where card.user_id = caller and card.copy_id = chosen_copy.id;
    change_id := private.record_deck_change(caller, chosen_deck_id, 'moved_to_main_deck');
  end if;

  if change_id is not null then
    insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
      values (
        caller,
        change_id,
        chosen_copy.id,
        chosen_copy.card_printing_id,
        chosen_copy.finish,
        private.deck_role(deck_card.commander_at),
        case when commander then 'commander' else 'main' end::public.deck_role
      );
    perform private.save_deck_evaluation(caller, chosen_deck_id);
  end if;

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

create or replace function public.set_basic_lands(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  changes jsonb;
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'counts']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  perform private.lock_deck(caller, chosen_deck_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'oracle_id', requested.oracle_id,
    'count_before', coalesce(basic_land.count, 0),
    'count_after', requested.count
  )), '[]'::jsonb)
    into changes
    from jsonb_to_recordset(checked -> 'counts') as requested(oracle_id uuid, count integer)
    left join public.deck_basic_lands basic_land
      on basic_land.user_id = caller and basic_land.deck_id = chosen_deck_id and basic_land.oracle_id = requested.oracle_id
    where requested.count <> coalesce(basic_land.count, 0);

  if jsonb_array_length(changes) > 0 then
    change_id := private.record_deck_change(caller, chosen_deck_id, 'basic_lands');
    insert into public.deck_change_basic_lands (user_id, deck_change_id, oracle_id, count_before, count_after)
      select caller, change_id, changed.oracle_id, changed.count_before, changed.count_after
      from jsonb_to_recordset(changes) as changed(oracle_id uuid, count_before integer, count_after integer);
    delete from public.deck_basic_lands basic_land
      where basic_land.user_id = caller
        and basic_land.deck_id = chosen_deck_id
        and basic_land.oracle_id in (select (change ->> 'oracle_id')::uuid from jsonb_array_elements(changes) change);
    insert into public.deck_basic_lands (user_id, deck_id, oracle_id, count)
      select caller, chosen_deck_id, changed.oracle_id, changed.count_after
      from jsonb_to_recordset(changes) as changed(oracle_id uuid, count_after integer)
      where changed.count_after > 0;
    perform private.save_deck_evaluation(caller, chosen_deck_id);
  end if;

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

create or replace function public.remove_deck_card(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  removed public.deck_cards;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['copy_id']);

  removed := private.lock_deck_card(caller, (checked ->> 'copy_id')::uuid);
  perform private.remove_from_deck(caller, removed, 'removed');

  return jsonb_build_object(
    'deck_id', removed.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = removed.deck_id)
  );
end;
$$;

create or replace function public.revert_deck_changes(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  chosen_change_id uuid;
  from_revision integer;
  effect jsonb;
  block jsonb;
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'deck_change_id', 'expected_revision', 'unprotect']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  chosen_change_id := (checked ->> 'deck_change_id')::uuid;

  perform private.lock_deck(caller, chosen_deck_id);
  from_revision := private.reverted_revision(caller, chosen_deck_id, chosen_change_id);
  if (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
    <> (checked ->> 'expected_revision')::integer then
    perform private.raise_search_error(
      'stale_revision',
      'expected_revision is not the deck revision. Read the revert preview again.',
      'expected_revision'
    );
  end if;

  perform 1
    from public.copies copy
    where copy.user_id = caller and copy.id in (
      select line.copy_id
      from public.deck_change_lines line
      join public.deck_changes change on change.user_id = line.user_id and change.id = line.deck_change_id
      where change.user_id = caller and change.deck_id = chosen_deck_id and change.revision >= from_revision
    )
    order by copy.id
    for update of copy;
  effect := private.revert_effect(caller, chosen_change_id);

  block := effect -> 'blocks' -> 0;
  if block is not null then
    perform private.raise_search_error(
      'revert_blocked',
      case when jsonb_typeof(block -> 'deck') = 'object'
        then format('%s is in %s.', block ->> 'name', block -> 'deck' ->> 'name')
        else format('%s is no longer in your collection.', block ->> 'name')
      end,
      'deck_change_id'
    );
  end if;
  if jsonb_array_length(effect -> 'protected_copies') > 0 then
    if not (checked ->> 'unprotect')::boolean then
      perform private.raise_search_error(
        'copy_protected',
        format(
          '%s is a protected copy. Send unprotect: true to unprotect it and revert.',
          effect -> 'protected_copies' -> 0 ->> 'name'
        ),
        'unprotect'
      );
    end if;
    update public.copies copy
      set is_protected = false
      where copy.user_id = caller
        and copy.id in (select (item ->> 'copy_id')::uuid from jsonb_array_elements(effect -> 'protected_copies') item);
  end if;

  change_id := private.record_deck_change(caller, chosen_deck_id, 'revert');
  update public.deck_changes change
    set reverted_by = change_id
    where change.user_id = caller
      and change.deck_id = chosen_deck_id
      and change.revision >= from_revision
      and change.id <> change_id
      and change.reverted_by is null;

  delete from public.deck_cards card
    using jsonb_to_recordset(effect -> 'copy_lines') as line(copy_id uuid, place_after public.deck_role)
    where card.user_id = caller and card.copy_id = line.copy_id and line.place_after is null;
  update public.deck_cards card
    set commander_at = case when line.place_after = 'commander' then now() end
    from jsonb_to_recordset(effect -> 'copy_lines') as line(copy_id uuid, place_before public.deck_role, place_after public.deck_role)
    where card.user_id = caller and card.copy_id = line.copy_id and line.place_before is not null and line.place_after is not null;
  insert into public.deck_cards (user_id, deck_id, copy_id, commander_at)
    select caller, chosen_deck_id, line.copy_id, case when line.place_after = 'commander' then now() end
    from jsonb_to_recordset(effect -> 'copy_lines') as line(copy_id uuid, place_before public.deck_role, place_after public.deck_role)
    where line.place_before is null;
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    select caller, change_id, line.copy_id, line.card_printing_id, line.finish, line.place_before, line.place_after
    from jsonb_to_recordset(effect -> 'copy_lines') as line(
      copy_id uuid,
      card_printing_id uuid,
      finish public.card_finish,
      place_before public.deck_role,
      place_after public.deck_role
    );

  insert into public.deck_change_basic_lands (user_id, deck_change_id, oracle_id, count_before, count_after)
    select caller, change_id, line.oracle_id, line.count_before, line.count_after
    from jsonb_to_recordset(effect -> 'basic_land_lines') as line(oracle_id uuid, count_before integer, count_after integer);
  delete from public.deck_basic_lands basic_land
    using jsonb_to_recordset(effect -> 'basic_land_lines') as line(oracle_id uuid)
    where basic_land.user_id = caller and basic_land.deck_id = chosen_deck_id and basic_land.oracle_id = line.oracle_id;
  insert into public.deck_basic_lands (user_id, deck_id, oracle_id, count)
    select caller, chosen_deck_id, line.oracle_id, line.count_after
    from jsonb_to_recordset(effect -> 'basic_land_lines') as line(oracle_id uuid, count_after integer)
    where line.count_after > 0;
  perform private.save_deck_evaluation(caller, chosen_deck_id);

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

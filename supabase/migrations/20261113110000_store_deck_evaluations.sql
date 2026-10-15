create type public.deck_validity as enum ('valid', 'invalid', 'cannot_be_determined');

create table public.deck_evaluations (
  user_id uuid not null,
  deck_id uuid not null,
  validity public.deck_validity not null,
  violations jsonb not null,
  undetermined jsonb not null,
  revision integer not null check (revision > 0),
  catalog_at timestamptz,
  judged_at timestamptz not null default now(),
  primary key (user_id, deck_id),
  foreign key (user_id, deck_id) references public.decks (user_id, id) on delete cascade
);

alter table public.deck_evaluations enable row level security;

revoke all on table public.deck_evaluations from anon, authenticated;
grant select on table public.deck_evaluations to authenticated;

create policy "Users read their own deck evaluations"
  on public.deck_evaluations
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create function private.violation(rule text, citation text, message text, hint text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('rule', rule, 'citation', citation, 'message', message, 'hint', hint, 'cards', '[]'::jsonb);
$$;

create function private.card_count_label(count integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when count = 1 then '1 card' else format('%s cards', count) end;
$$;

create function private.judge_deck(contents jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  commander_count integer;
  card_count integer;
  violations jsonb := '[]';
  undetermined jsonb := '[]';
begin
  select count(*) filter (where copy.role = 'commander'), count(*)
    into commander_count, card_count
    from jsonb_to_recordset(contents -> 'copies') as copy(copy_id uuid, card_printing_id uuid, role public.deck_role);
  card_count := card_count + (
    select coalesce(sum(land.count), 0)
    from jsonb_to_recordset(contents -> 'basic_lands') as land(oracle_id uuid, count integer)
  );

  if commander_count = 0 then
    violations := violations || private.violation('no_commander', 'CR 903.3', 'This deck has no commander.', null);
  end if;
  if card_count <> 100 then
    violations := violations || private.violation(
      'deck_size',
      'CR 903.5a',
      format('%s of 100 cards.', card_count),
      case
        when card_count < 100 then format('Add %s.', private.card_count_label(100 - card_count))
        else format('Remove %s.', private.card_count_label(card_count - 100))
      end
    );
  end if;

  return jsonb_build_object(
    'validity', case
      when jsonb_array_length(violations) > 0 then 'invalid'
      when jsonb_array_length(undetermined) > 0 then 'cannot_be_determined'
      else 'valid'
    end,
    'violations', violations,
    'undetermined', undetermined,
    'catalog_at', (select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'catalog')
  );
end;
$$;

create function private.deck_contents(owner_id uuid, chosen_deck_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'copies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'copy_id', copy.id,
        'card_printing_id', copy.card_printing_id,
        'role', private.deck_role(deck_card.commander_at)
      ) order by copy.id)
      from public.deck_cards deck_card
      join public.copies copy on copy.user_id = deck_card.user_id and copy.id = deck_card.copy_id
      where deck_card.user_id = owner_id and deck_card.deck_id = chosen_deck_id
    ), '[]'::jsonb),
    'basic_lands', coalesce((
      select jsonb_agg(jsonb_build_object('oracle_id', basic_land.oracle_id, 'count', basic_land.count) order by basic_land.oracle_id)
      from public.deck_basic_lands basic_land
      where basic_land.user_id = owner_id and basic_land.deck_id = chosen_deck_id
    ), '[]'::jsonb)
  );
$$;

create function private.save_deck_evaluation(owner_id uuid, chosen_deck_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  contents jsonb;
  judged jsonb;
begin
  contents := private.deck_contents(owner_id, chosen_deck_id);
  if contents -> 'copies' = '[]'::jsonb and contents -> 'basic_lands' = '[]'::jsonb then
    delete from public.deck_evaluations evaluation
      where evaluation.user_id = owner_id and evaluation.deck_id = chosen_deck_id;
    return;
  end if;

  judged := private.judge_deck(contents);
  insert into public.deck_evaluations (user_id, deck_id, validity, violations, undetermined, revision, catalog_at, judged_at)
    select owner_id, chosen_deck_id, (judged ->> 'validity')::public.deck_validity, judged -> 'violations',
      judged -> 'undetermined', deck.revision, (judged ->> 'catalog_at')::timestamptz, now()
    from public.decks deck
    where deck.user_id = owner_id and deck.id = chosen_deck_id
    on conflict (user_id, deck_id) do update
      set validity = excluded.validity,
        violations = excluded.violations,
        undetermined = excluded.undetermined,
        revision = excluded.revision,
        catalog_at = excluded.catalog_at,
        judged_at = excluded.judged_at;
end;
$$;

create or replace function private.remove_from_deck(caller uuid, deck_card public.deck_cards, change_kind public.deck_change_kind)
returns void
language plpgsql
set search_path = ''
as $$
declare
  chosen_copy public.copies;
  change_id uuid;
begin
  delete from public.deck_cards card where card.user_id = caller and card.copy_id = deck_card.copy_id;
  select * into chosen_copy from public.copies copy where copy.user_id = caller and copy.id = deck_card.copy_id;

  change_id := private.record_deck_change(caller, deck_card.deck_id, change_kind);
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    values (
      caller,
      change_id,
      chosen_copy.id,
      chosen_copy.card_printing_id,
      chosen_copy.finish,
      private.deck_role(deck_card.commander_at),
      null
    );
  perform private.save_deck_evaluation(caller, deck_card.deck_id);
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
create or replace function public.list_decks()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      private.deck_row(deck) || jsonb_build_object('evaluation', (
        select jsonb_build_object('validity', evaluation.validity)
        from public.deck_evaluations evaluation
        where evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
      ))
      order by deck.last_used_at desc, lower(deck.name), deck.name, deck.id
    )
    from public.decks deck
  ), '[]'::jsonb));
end;
$$;
create or replace function public.get_deck(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  prices_stale boolean;
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_request(query, array['deck_id']);
  select f.is_stale into prices_stale
    from public.catalog_freshness() f
    where f.source = 'prices';

  select private.deck_row(deck) || jsonb_build_object(
    'revision', deck.revision,
    'created_at', deck.created_at,
    'evaluation', (
      select (to_jsonb(evaluation) - 'user_id' - 'deck_id') || jsonb_build_object('validity_rules_data_at', evaluation.catalog_at)
      from public.deck_evaluations evaluation
      where evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
    ),
    'cards', (
      select coalesce(jsonb_agg(
        private.copy_row(a, p, c, price, prices_stale) || jsonb_build_object(
          'role', private.deck_role(deck_card.commander_at),
          'commander_at', deck_card.commander_at,
          'added_at', deck_card.added_at,
          'type_line', c.type_line,
          'mana_value', c.mana_value,
          'colors', to_jsonb(c.colors)
        )
        order by c.name, a.copy_id
      ), '[]'::jsonb)
      from public.deck_cards deck_card
      join private.collection_availability a on a.user_id = deck_card.user_id and a.copy_id = deck_card.copy_id
      join public.card_printings p on p.id = a.card_printing_id
      join public.cards c on c.oracle_id = p.oracle_id
      left join public.card_prices price on price.printing_id = p.id
      where deck_card.user_id = deck.user_id and deck_card.deck_id = deck.id
    ),
    'basic_lands', (
      select jsonb_agg(
        jsonb_build_object(
          'oracle_id', land.oracle_id,
          'name', land.name,
          'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb),
          'count', coalesce(basic_land.count, 0)
        )
        order by land.kind_order
      )
      from private.basic_land_cards() land
      left join public.deck_basic_lands basic_land
        on basic_land.user_id = deck.user_id and basic_land.deck_id = deck.id and basic_land.oracle_id = land.oracle_id
    )
  )
    into result
    from public.decks deck
    where deck.id = (checked ->> 'deck_id')::uuid;
  if result is null then
    perform private.raise_deck_not_found();
  end if;
  return result;
end;
$$;
select private.save_deck_evaluation(deck.user_id, deck.id) from public.decks deck;

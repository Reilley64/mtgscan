create function private.finish_deck_change(owner_id uuid, chosen_deck_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.planned_swaps swap
    set status = 'closed', close_note = 'outgoing_left_deck', status_changed_at = now()
    where swap.user_id = owner_id
      and swap.deck_id = chosen_deck_id
      and swap.status = 'open'
      and not private.outgoing_card_is_in_deck(owner_id, chosen_deck_id, swap.outgoing_copy_id, swap.outgoing_oracle_id);
  perform private.save_deck_evaluation(owner_id, chosen_deck_id);
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
  perform private.finish_deck_change(caller, deck_card.deck_id);
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
  perform private.finish_deck_change(caller, chosen_deck_id);

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
    perform private.finish_deck_change(caller, chosen_deck_id);
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
    perform private.finish_deck_change(caller, chosen_deck_id);
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
  perform private.finish_deck_change(caller, chosen_deck_id);

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id)
  );
end;
$$;

drop function private.locked_planned_swap(uuid, uuid);

create function private.locked_planned_swap(
  owner_id uuid,
  chosen_planned_swap_id uuid,
  changeable_statuses public.planned_swap_status[]
)
returns public.planned_swaps
language plpgsql
set search_path = ''
as $$
declare
  swap public.planned_swaps;
begin
  select * into swap from public.planned_swaps found where found.user_id = owner_id and found.id = chosen_planned_swap_id;
  if swap.id is null then
    perform private.raise_search_error('not_found', 'planned_swap_id is not one of your planned swaps.', 'planned_swap_id');
  end if;
  perform private.lock_deck(owner_id, swap.deck_id);
  select * into swap from public.planned_swaps found where found.user_id = owner_id and found.id = chosen_planned_swap_id for update;
  if not swap.status = any(changeable_statuses) then
    perform private.raise_search_error(
      'not_open',
      format('The planned swap is %s. Only an open planned swap can change.', swap.status),
      'planned_swap_id'
    );
  end if;
  return swap;
end;
$$;

create or replace function public.swap_in_planned_swap(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  swap public.planned_swaps;
  held_copy public.copies;
  outgoing_card public.deck_cards;
  change_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['planned_swap_id']);
  swap := private.locked_planned_swap(caller, (checked ->> 'planned_swap_id')::uuid, array['open']::public.planned_swap_status[]);
  select * into held_copy from public.copies copy where copy.user_id = caller and copy.id = swap.incoming_copy_id for update;

  delete from public.deck_cards card
    where card.user_id = caller and card.deck_id = swap.deck_id and card.copy_id = swap.outgoing_copy_id
    returning * into outgoing_card;
  if swap.as_commander and (
    select count(*)
    from public.deck_cards card
    where card.user_id = caller and card.deck_id = swap.deck_id and card.commander_at is not null
  ) >= 2 then
    perform private.raise_search_error('commander_limit', 'A deck has at most two commanders.', 'planned_swap_id');
  end if;
  insert into public.deck_cards (user_id, deck_id, copy_id, commander_at)
    values (caller, swap.deck_id, held_copy.id, case when swap.as_commander then now() end);

  change_id := private.record_deck_change(caller, swap.deck_id, 'swapped_in');
  update public.deck_changes change
    set reason = swap.reason, client_name = swap.client_name
    where change.user_id = caller and change.id = change_id;
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    values (
      caller,
      change_id,
      held_copy.id,
      held_copy.card_printing_id,
      held_copy.finish,
      null,
      case when swap.as_commander then 'commander' else 'main' end::public.deck_role
    );
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    select caller, change_id, copy.id, copy.card_printing_id, copy.finish, private.deck_role(outgoing_card.commander_at), null
    from public.copies copy
    where copy.user_id = caller and copy.id = outgoing_card.copy_id;

  update public.planned_swaps planned
    set status = 'swapped_in', status_changed_at = now()
    where planned.user_id = caller and planned.id = swap.id;
  perform private.finish_deck_change(caller, swap.deck_id);

  return jsonb_build_object(
    'deck_id', swap.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = swap.deck_id)
  );
end;
$$;

create function private.closed_planned_swap(owner_id uuid, request jsonb, note public.close_note)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  checked jsonb;
  swap public.planned_swaps;
begin
  checked := private.check_request(request, array['planned_swap_id']);
  swap := private.locked_planned_swap(
    owner_id,
    (checked ->> 'planned_swap_id')::uuid,
    array['open', 'closed']::public.planned_swap_status[]
  );
  if swap.status = 'open' then
    update public.planned_swaps planned
      set status = 'closed', close_note = note, status_changed_at = now()
      where planned.user_id = owner_id and planned.id = swap.id;
  end if;
  return jsonb_build_object('id', swap.id, 'changed', swap.status = 'open');
end;
$$;

create function public.close_planned_swap(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  return private.closed_planned_swap(caller, request, 'closed_by_user');
end;
$$;

create function public.mcp_close_planned_swap(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  return private.closed_planned_swap(caller, request, 'closed_by_ai_client');
end;
$$;

revoke all on function public.close_planned_swap(jsonb), public.mcp_close_planned_swap(jsonb) from public, anon, service_role;
grant execute on function public.close_planned_swap(jsonb), public.mcp_close_planned_swap(jsonb) to authenticated;

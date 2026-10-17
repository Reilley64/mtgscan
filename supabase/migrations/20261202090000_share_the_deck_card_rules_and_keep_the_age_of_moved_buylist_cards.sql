create or replace function private.checked_object(path text, value jsonb, required_fields text[], optional_fields text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  key text;
  member jsonb;
  field text;
begin
  if jsonb_typeof(value) is distinct from 'object' then
    perform private.invalid_argument(path, coalesce(path || ' must be a JSON object.', 'The request must be a JSON object.'));
  end if;

  for key, member in select entry.key, entry.value from jsonb_each(value) as entry order by entry.key loop
    field := concat_ws('.', path, key);
    if not key = any(required_fields || optional_fields) then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(key, case key
      when 'name' then private.checked_name(member)
      when 'tagged' then private.checked_boolean(field, member)
      when 'unprotect' then private.checked_boolean(field, member)
      when 'commander' then private.checked_boolean(field, member)
      when 'as_commander' then private.checked_boolean(field, member)
      when 'move_planned_swap' then private.checked_boolean(field, member)
      when 'priority' then private.checked_choice(field, member, enum_range(null::public.deck_priority)::text[])
      when 'order' then private.checked_choice(field, member, array['newest_first', 'oldest_first'])
      when 'status' then member
      when 'limit' then private.checked_integer(field, member, 1, 50)
      when 'cursor' then private.checked_cursor(field, member)
      when 'counts' then private.checked_basic_land_counts(field, member)
      when 'expected_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'expected_deck_revision' then private.checked_integer(field, member, 0, 2147483647)
      when 'idempotency_key' then private.checked_key(field, member, 8)
      when 'ref' then private.checked_key(field, member, 1)
      when 'reason' then private.checked_reason(field, member)
      when 'planned_swaps' then private.checked_planned_swaps(field, member)
      when 'buylist_cards' then private.checked_buylist_cards(field, member)
      when 'incoming' then member
      when 'outgoing' then private.checked_outgoing(field, member)
      else private.checked_uuid(field, member)
    end);
  end loop;

  foreach key in array required_fields loop
    if not checked ? key then
      field := concat_ws('.', path, key);
      perform private.invalid_argument(field, format('%s is required.', field));
    end if;
  end loop;
  return checked;
end;
$$;

create or replace function private.move_planned_swaps_to_buylist(owner_id uuid, held_copy_ids uuid[], note public.close_note)
returns void
language sql
set search_path = ''
as $$
  with moved as (
    update public.planned_swaps swap
      set status = 'moved_to_buylist', close_note = note, status_changed_at = now()
      where swap.user_id = owner_id and swap.incoming_copy_id = any (held_copy_ids) and swap.status = 'open'
      returning swap.*
  )
  insert into public.buylist_cards (
    user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason, client_id, client_name, created_at
  )
  select
    moved.user_id,
    moved.deck_id,
    moved.incoming_oracle_id,
    moved.as_commander,
    moved.outgoing_copy_id,
    moved.outgoing_oracle_id,
    moved.reason,
    moved.client_id,
    moved.client_name,
    moved.created_at
  from moved
  where not exists (
    select
    from public.buylist_cards saved
    where saved.user_id = moved.user_id
      and saved.deck_id = moved.deck_id
      and saved.status = 'open'
      and private.planned_swap_identity(to_jsonb(saved)) = private.planned_swap_identity(to_jsonb(moved))
  );
$$;

create or replace function public.delete_copy(request jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_copy_id uuid;
  removed public.deck_cards;
  held record;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.checked_object(null, request, array['copy_id'], array['move_planned_swap']);
  chosen_copy_id := (checked ->> 'copy_id')::uuid;

  perform private.lock_planned_swaps_holding(caller, array[chosen_copy_id]);
  removed := private.lock_deck_of_copy(caller, chosen_copy_id);
  select card.name, deck.name as deck_name into held
    from public.planned_swaps swap
    join public.decks deck on deck.user_id = swap.user_id and deck.id = swap.deck_id
    join public.cards card on card.oracle_id = swap.incoming_oracle_id
    where swap.user_id = caller and swap.incoming_copy_id = chosen_copy_id and swap.status = 'open';
  if held.name is not null then
    if not coalesce((checked ->> 'move_planned_swap')::boolean, false) then
      perform private.raise_search_error(
        'copy_held',
        format(
          '%s is held by the planned swap for %s. Send move_planned_swap: true to move that planned swap to the buylist and delete the copy.',
          held.name,
          held.deck_name
        ),
        'move_planned_swap'
      );
    end if;
    perform private.move_planned_swaps_to_buylist(caller, array[chosen_copy_id], 'held_copy_deleted');
  end if;
  if removed.copy_id is not null then
    perform private.remove_from_deck(caller, removed, 'removed_from_collection');
  end if;

  delete from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id;
  if not found then
    perform private.raise_copy_not_found();
  end if;
end;
$$;

create or replace function private.swap_effect(
  owner_id uuid,
  chosen_deck_id uuid,
  incoming jsonb,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.deck_change_effect(
    evaluation,
    private.judge_deck(jsonb_build_object(
      'copies',
      coalesce((
        select jsonb_agg(deck_copy)
        from jsonb_array_elements(deck.contents -> 'copies') deck_copy
        where (deck_copy ->> 'copy_id')::uuid is distinct from swap_effect.outgoing_copy_id
      ), '[]'::jsonb) || case when incoming ? 'card_printing_id' then jsonb_build_array(jsonb_build_object(
        'copy_id', coalesce(incoming -> 'copy_id', to_jsonb(gen_random_uuid())),
        'card_printing_id', incoming -> 'card_printing_id',
        'role', case when (incoming ->> 'as_commander')::boolean then 'commander' else 'main' end
      )) else '[]'::jsonb end,
      'basic_lands',
      coalesce((
        select jsonb_agg(jsonb_build_object('oracle_id', land.oracle_id, 'count', land.count) order by land.oracle_id)
        from (
          select counted.oracle_id, sum(counted.count) as count
          from (
            select (stored_land ->> 'oracle_id')::uuid as oracle_id, (stored_land ->> 'count')::integer as count
            from jsonb_array_elements(deck.contents -> 'basic_lands') stored_land
            union all
            select (incoming ->> 'basic_land_oracle_id')::uuid, 1
            where incoming ? 'basic_land_oracle_id'
            union all
            select swap_effect.outgoing_oracle_id, -1
            where swap_effect.outgoing_copy_id is null and swap_effect.outgoing_oracle_id is not null
          ) counted
          group by counted.oracle_id
          having sum(counted.count) > 0
        ) land
      ), '[]'::jsonb)
    ))
  )
  from (select private.deck_contents(owner_id, chosen_deck_id) as contents) deck
  left join public.deck_evaluations evaluation on evaluation.user_id = owner_id and evaluation.deck_id = chosen_deck_id;
$$;

create or replace function private.planned_swap_effect(
  owner_id uuid,
  chosen_deck_id uuid,
  held_copy_id uuid,
  incoming_oracle_id uuid,
  as_commander boolean,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when held_copy_id is null then private.swap_effect(
      owner_id,
      chosen_deck_id,
      jsonb_build_object('basic_land_oracle_id', incoming_oracle_id),
      outgoing_copy_id,
      outgoing_oracle_id
    )
    else (
      select private.swap_effect(
        owner_id,
        chosen_deck_id,
        jsonb_build_object('copy_id', held.id, 'card_printing_id', held.card_printing_id, 'as_commander', planned_swap_effect.as_commander),
        outgoing_copy_id,
        outgoing_oracle_id
      )
      from public.copies held
      where held.user_id = owner_id and held.id = held_copy_id
    )
  end;
$$;

create or replace function private.buylist_card_effect(
  owner_id uuid,
  chosen_deck_id uuid,
  card_oracle_id uuid,
  as_commander boolean,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.swap_effect(
    owner_id,
    chosen_deck_id,
    jsonb_build_object('card_printing_id', private.default_printing_id(card_oracle_id), 'as_commander', buylist_card_effect.as_commander),
    outgoing_copy_id,
    outgoing_oracle_id
  );
$$;

create function private.commander_count_under_limit(owner_id uuid, chosen_deck_id uuid, field text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  commander_count integer;
begin
  select count(*) into commander_count
    from public.deck_cards card
    where card.user_id = owner_id and card.deck_id = chosen_deck_id and card.commander_at is not null;
  if commander_count >= 2 then
    perform private.raise_search_error('commander_limit', 'A deck has at most two commanders.', field);
  end if;
  return commander_count;
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
    commander_count := private.commander_count_under_limit(caller, chosen_deck_id, 'commander');
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

create or replace function private.swap_into_deck(
  owner_id uuid,
  chosen_deck_id uuid,
  incoming public.copies,
  incoming_oracle_id uuid,
  incoming_as_commander boolean,
  outgoing_copy_id uuid,
  outgoing_oracle_id uuid,
  change_kind public.deck_change_kind,
  change_reason text,
  change_client_name text,
  field text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  outgoing_card public.deck_cards;
  change_id uuid;
begin
  delete from public.deck_cards card
    where card.user_id = owner_id and card.deck_id = chosen_deck_id and card.copy_id = swap_into_deck.outgoing_copy_id
    returning * into outgoing_card;
  if incoming_as_commander then
    perform private.commander_count_under_limit(owner_id, chosen_deck_id, field);
  end if;
  if incoming.id is not null then
    insert into public.deck_cards (user_id, deck_id, copy_id, commander_at)
      values (owner_id, chosen_deck_id, incoming.id, case when incoming_as_commander then now() end);
  end if;

  change_id := private.record_deck_change(owner_id, chosen_deck_id, change_kind);
  update public.deck_changes change
    set reason = change_reason, client_name = change_client_name
    where change.user_id = owner_id and change.id = change_id;
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    select
      owner_id,
      change_id,
      incoming.id,
      incoming.card_printing_id,
      incoming.finish,
      null,
      case when incoming_as_commander then 'commander' else 'main' end::public.deck_role
    where incoming.id is not null;
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    select owner_id, change_id, copy.id, copy.card_printing_id, copy.finish, private.deck_role(outgoing_card.commander_at), null
    from public.copies copy
    where copy.user_id = owner_id and copy.id = outgoing_card.copy_id;

  insert into public.deck_change_basic_lands (user_id, deck_change_id, oracle_id, count_before, count_after)
    select owner_id, change_id, land.oracle_id, coalesce(stored.count, 0), coalesce(stored.count, 0) + land.change
    from (
      values
        (case when incoming.id is null then incoming_oracle_id end, 1),
        (case when outgoing_copy_id is null then outgoing_oracle_id end, -1)
    ) land(oracle_id, change)
    left join public.deck_basic_lands stored
      on stored.user_id = owner_id and stored.deck_id = chosen_deck_id and stored.oracle_id = land.oracle_id
    where land.oracle_id is not null and coalesce(stored.count, 0) + land.change >= 0;
  delete from public.deck_basic_lands stored
    using public.deck_change_basic_lands line
    where stored.user_id = owner_id
      and stored.deck_id = chosen_deck_id
      and line.user_id = owner_id
      and line.deck_change_id = change_id
      and line.oracle_id = stored.oracle_id;
  insert into public.deck_basic_lands (user_id, deck_id, oracle_id, count)
    select owner_id, chosen_deck_id, line.oracle_id, line.count_after
    from public.deck_change_basic_lands line
    where line.user_id = owner_id and line.deck_change_id = change_id and line.count_after > 0;
end;
$$;

create function private.take_free_copy(owner_id uuid, chosen_copy public.copies, unprotect boolean)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not (select a.is_free from private.collection_availability a where a.user_id = owner_id and a.copy_id = chosen_copy.id) then
    perform private.raise_search_error('copy_not_free', 'Only a free copy can go into a deck.', 'copy_id');
  end if;
  if chosen_copy.is_protected then
    if not unprotect then
      perform private.raise_search_error(
        'copy_protected',
        'copy_id is a protected copy. Send unprotect: true to unprotect it and put it in the deck.',
        'copy_id'
      );
    end if;
    update public.copies copy set is_protected = false where copy.user_id = owner_id and copy.id = chosen_copy.id;
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
  perform private.take_free_copy(caller, chosen_copy, (checked ->> 'unprotect')::boolean);

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

create or replace function public.mark_buylist_card_bought(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  card public.buylist_cards;
  chosen_copy public.copies;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['buylist_card_id', 'copy_id', 'unprotect']);
  card := private.locked_buylist_card(caller, (checked ->> 'buylist_card_id')::uuid, array['open']::public.buylist_card_status[]);
  select * into chosen_copy
    from public.copies copy
    where copy.user_id = caller and copy.id = (checked ->> 'copy_id')::uuid
    for update;
  if chosen_copy.id is null then
    perform private.raise_copy_not_found();
  end if;

  if (select printing.oracle_id from public.card_printings printing where printing.id = chosen_copy.card_printing_id)
    <> card.incoming_oracle_id then
    perform private.invalid_argument('copy_id', 'copy_id is not a copy of the card on the buylist card.');
  end if;
  perform private.take_free_copy(caller, chosen_copy, (checked ->> 'unprotect')::boolean);

  perform private.swap_into_deck(
    caller,
    card.deck_id,
    chosen_copy,
    card.incoming_oracle_id,
    card.as_commander,
    card.outgoing_copy_id,
    card.outgoing_oracle_id,
    'bought',
    card.reason,
    card.client_name,
    'buylist_card_id'
  );
  update public.buylist_cards bought
    set status = 'bought', status_changed_at = now()
    where bought.user_id = caller and bought.id = card.id;
  perform private.finish_deck_change(caller, card.deck_id);

  return jsonb_build_object(
    'deck_id', card.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = card.deck_id)
  );
end;
$$;

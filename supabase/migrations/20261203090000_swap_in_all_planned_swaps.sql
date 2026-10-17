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
      when 'planned_swap_ids' then private.checked_uuid_list(field, member, 100)
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

create function private.swap_in(owner_id uuid, swap public.planned_swaps, field text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  held_copy public.copies;
begin
  select * into held_copy from public.copies copy where copy.user_id = owner_id and copy.id = swap.incoming_copy_id for update;

  perform private.swap_into_deck(
    owner_id,
    swap.deck_id,
    held_copy,
    swap.incoming_oracle_id,
    swap.as_commander,
    swap.outgoing_copy_id,
    swap.outgoing_oracle_id,
    'swapped_in',
    swap.reason,
    swap.client_name,
    field
  );
  update public.planned_swaps planned
    set status = 'swapped_in', status_changed_at = now()
    where planned.user_id = owner_id and planned.id = swap.id;
  perform private.finish_deck_change(owner_id, swap.deck_id);
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
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['planned_swap_id']);
  swap := private.locked_planned_swap(caller, (checked ->> 'planned_swap_id')::uuid, array['open']::public.planned_swap_status[]);
  perform private.swap_in(caller, swap, 'planned_swap_id');

  return jsonb_build_object(
    'deck_id', swap.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = swap.deck_id)
  );
end;
$$;

create function public.swap_in_planned_swaps(request jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  chosen_deck_id uuid;
  requested_ids uuid[];
  item_index bigint;
  found_id uuid;
  found_status public.planned_swap_status;
  swap public.planned_swaps;
  swapped_in uuid[] := '{}';
  closed uuid[] := '{}';
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'planned_swap_ids']);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  requested_ids := array(select jsonb_array_elements_text(checked -> 'planned_swap_ids')::uuid);

  perform private.lock_deck(caller, chosen_deck_id);
  perform 1
    from public.planned_swaps planned
    where planned.user_id = caller and planned.deck_id = chosen_deck_id and planned.id = any(requested_ids)
    order by planned.id
    for update;
  for item_index, found_id, found_status in
    select listed.ordinality - 1, planned.id, planned.status
    from unnest(requested_ids) with ordinality listed(id, ordinality)
    left join public.planned_swaps planned
      on planned.user_id = caller and planned.deck_id = chosen_deck_id and planned.id = listed.id
    order by listed.ordinality
  loop
    if found_id is null then
      perform private.raise_search_error(
        'not_found',
        format('planned_swap_ids[%s] is not one of your planned swaps in this deck.', item_index),
        format('planned_swap_ids[%s]', item_index)
      );
    end if;
    if found_status <> 'open' then
      perform private.raise_search_error(
        'not_open',
        format('The planned swap is %s. Only an open planned swap can change.', found_status),
        format('planned_swap_ids[%s]', item_index)
      );
    end if;
  end loop;
  perform 1
    from public.copies copy
    join public.planned_swaps planned on planned.user_id = copy.user_id and planned.incoming_copy_id = copy.id
    where copy.user_id = caller and planned.id = any(requested_ids)
    order by copy.id
    for update of copy;

  for swap in
    select * from public.planned_swaps planned
    where planned.user_id = caller and planned.id = any(requested_ids)
    order by planned.created_at, planned.id
  loop
    if (select planned.status from public.planned_swaps planned where planned.user_id = caller and planned.id = swap.id) = 'closed' then
      closed := closed || swap.id;
    else
      perform private.swap_in(caller, swap, format('planned_swap_ids[%s]', array_position(requested_ids, swap.id) - 1));
      swapped_in := swapped_in || swap.id;
    end if;
  end loop;

  return jsonb_build_object(
    'deck_id', chosen_deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id),
    'swapped_in', to_jsonb(swapped_in),
    'closed', to_jsonb(closed)
  );
end;
$$;

revoke all on function public.swap_in_planned_swaps(jsonb) from public, anon, service_role;
grant execute on function public.swap_in_planned_swaps(jsonb) to authenticated;

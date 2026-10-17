alter table public.deck_changes add column reason text, add column client_name text;

create or replace function public.list_deck_changes(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  chosen_deck_id uuid;
  page_size integer;
  query_hash text;
  after_revision integer;
  page_rows jsonb;
  next_cursor text;
begin
  perform private.caller_user_id();
  checked := private.check_deck_changes_query(query);
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  page_size := (checked ->> 'limit')::integer;
  query_hash := md5('deck changes ' || chosen_deck_id::text);

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    begin
      after_revision := (private.read_page_cursor(checked ->> 'cursor', query_hash, 1) ->> 0)::integer;
    exception when invalid_text_representation then
      after_revision := null;
    end;
    if after_revision is null then
      perform private.raise_search_error('invalid_cursor', 'The cursor is not valid. Start again without a cursor.', 'cursor');
    end if;
  end if;

  if not exists (select 1 from public.decks deck where deck.id = chosen_deck_id) then
    perform private.raise_deck_not_found();
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'deck_change_id', change.id,
      'revision', change.revision,
      'kind', change.kind,
      'changed_at', change.changed_at,
      'reverted', change.reverted_by is not null,
      'reason', change.reason,
      'client_name', change.client_name,
      'lines', private.deck_change_lines(change.user_id, change.id)
    )
    order by change.revision desc
  ), '[]'::jsonb)
    into page_rows
    from (
      select *
      from public.deck_changes change
      where change.deck_id = chosen_deck_id
        and (after_revision is null or change.revision < after_revision)
      order by change.revision desc
      limit page_size + 1
    ) change;

  if jsonb_array_length(page_rows) > page_size then
    page_rows := page_rows - page_size;
    next_cursor := private.page_cursor(query_hash, jsonb_build_array(page_rows -> (page_size - 1) -> 'revision'));
  end if;

  return jsonb_build_object('items', page_rows, 'next_cursor', next_cursor);
end;
$$;

create function private.locked_planned_swap(owner_id uuid, chosen_planned_swap_id uuid)
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
  if swap.status <> 'open' then
    perform private.raise_search_error(
      'not_open',
      format('The planned swap is %s. Only an open planned swap can change.', swap.status),
      'planned_swap_id'
    );
  end if;
  return swap;
end;
$$;

create function public.swap_in_planned_swap(request jsonb)
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
  swap := private.locked_planned_swap(caller, (checked ->> 'planned_swap_id')::uuid);
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
  perform private.save_deck_evaluation(caller, swap.deck_id);

  return jsonb_build_object(
    'deck_id', swap.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = swap.deck_id)
  );
end;
$$;

revoke all on function public.swap_in_planned_swap(jsonb) from public, anon, service_role;
grant execute on function public.swap_in_planned_swap(jsonb) to authenticated;

create function private.planned_copy_line(owner_id uuid, line_copy_id uuid, line_oracle_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', 'copy',
    'copy_id', line_copy_id,
    'name', card.name,
    'image_uris', coalesce(to_jsonb(printing.image_uris), '[]'::jsonb),
    'type_line', card.type_line,
    'set', printing.set_code,
    'collector_number', printing.collector_number,
    'finish', copy.finish,
    'condition', copy.condition
  )
  from public.cards card
  left join public.copies copy on copy.user_id = owner_id and copy.id = line_copy_id
  left join public.card_printings printing on printing.id = copy.card_printing_id
  where card.oracle_id = line_oracle_id;
$$;

grant execute on function private.planned_copy_line(uuid, uuid, uuid) to authenticated;

create function public.list_planned_swaps(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  chosen_deck_id uuid;
  chosen_status public.planned_swap_status;
  oldest_first boolean;
  page_size integer;
  query_hash text;
  after_key jsonb;
  after_created_at timestamptz;
  after_id uuid;
  page_rows jsonb;
  next_cursor text;
begin
  perform private.caller_user_id();
  checked := jsonb_build_object('limit', 20, 'order', 'newest_first')
    || private.checked_object(null, query, '{}', array['deck_id', 'status', 'order', 'cursor', 'limit']);
  if checked ? 'status' then
    perform private.checked_choice('status', checked -> 'status', enum_range(null::public.planned_swap_status)::text[]);
  end if;
  chosen_deck_id := (checked ->> 'deck_id')::uuid;
  chosen_status := (checked ->> 'status')::public.planned_swap_status;
  oldest_first := checked ->> 'order' = 'oldest_first';
  page_size := (checked ->> 'limit')::integer;
  query_hash := md5(concat_ws(' ', 'planned swaps', chosen_deck_id, chosen_status, checked ->> 'order'));

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    after_key := private.read_page_cursor(checked ->> 'cursor', query_hash, 2);
    begin
      after_created_at := (after_key ->> 0)::timestamptz;
      after_id := (after_key ->> 1)::uuid;
    exception when data_exception then
      after_id := null;
    end;
    if after_created_at is null or after_id is null then
      perform private.raise_search_error('invalid_cursor', 'The cursor is not valid. Start again without a cursor.', 'cursor');
    end if;
  end if;

  if chosen_deck_id is not null and not exists (select 1 from public.decks deck where deck.id = chosen_deck_id) then
    perform private.raise_deck_not_found();
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'planned_swap_id', swap.id,
      'deck_id', swap.deck_id,
      'deck_name', deck.name,
      'commander_art_crop_uri', private.deck_row(deck) -> 'commanders' -> 0 -> 'art_crop_uri',
      'incoming', private.planned_copy_line(swap.user_id, swap.incoming_copy_id, swap.incoming_oracle_id),
      'outgoing', private.planned_copy_line(swap.user_id, swap.outgoing_copy_id, swap.outgoing_oracle_id),
      'as_commander', swap.as_commander,
      'reason', swap.reason,
      'status', swap.status,
      'close_note', swap.close_note,
      'client_name', swap.client_name,
      'created_at', swap.created_at,
      'status_changed_at', swap.status_changed_at,
      'effect', case when swap.status = 'open' then private.planned_swap_effect(
        swap.user_id, swap.deck_id, swap.incoming_copy_id, swap.as_commander, swap.outgoing_copy_id
      ) end
    )
    order by
      case when oldest_first then swap.created_at end,
      case when oldest_first then swap.id end,
      swap.created_at desc,
      swap.id desc
  ), '[]'::jsonb)
    into page_rows
    from (
      select *
      from public.planned_swaps listed
      where (chosen_deck_id is null or listed.deck_id = chosen_deck_id)
        and (chosen_status is null or listed.status = chosen_status)
        and (
          after_id is null
          or (oldest_first and (listed.created_at, listed.id) > (after_created_at, after_id))
          or (not oldest_first and (listed.created_at, listed.id) < (after_created_at, after_id))
        )
      order by
        case when oldest_first then listed.created_at end,
        case when oldest_first then listed.id end,
        listed.created_at desc,
        listed.id desc
      limit page_size + 1
    ) swap
    join public.decks deck on deck.user_id = swap.user_id and deck.id = swap.deck_id;

  if jsonb_array_length(page_rows) > page_size then
    page_rows := page_rows - page_size;
    next_cursor := private.page_cursor(
      query_hash,
      jsonb_build_array(page_rows -> (page_size - 1) -> 'created_at', page_rows -> (page_size - 1) -> 'planned_swap_id')
    );
  end if;

  return jsonb_build_object('items', page_rows, 'next_cursor', next_cursor);
end;
$$;

revoke all on function public.list_planned_swaps(jsonb) from public, anon, service_role;
grant execute on function public.list_planned_swaps(jsonb) to authenticated;

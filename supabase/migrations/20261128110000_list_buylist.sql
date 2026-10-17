create function private.checked_plan_query(query jsonb, list_name text, statuses text[])
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  after_key jsonb;
  after_created_at timestamptz;
  after_id uuid;
begin
  checked := jsonb_build_object('limit', 20, 'order', 'newest_first')
    || private.checked_object(null, query, '{}', array['deck_id', 'status', 'order', 'cursor', 'limit']);
  if checked ? 'status' then
    perform private.checked_choice('status', checked -> 'status', statuses);
  end if;
  checked := checked || jsonb_build_object(
    'query_hash', md5(concat_ws(' ', list_name, checked ->> 'deck_id', checked ->> 'status', checked ->> 'order'))
  );

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    after_key := private.read_page_cursor(checked ->> 'cursor', checked ->> 'query_hash', 2);
    begin
      after_created_at := (after_key ->> 0)::timestamptz;
      after_id := (after_key ->> 1)::uuid;
    exception when data_exception then
      after_id := null;
    end;
    if after_created_at is null or after_id is null then
      perform private.raise_search_error('invalid_cursor', 'The cursor is not valid. Start again without a cursor.', 'cursor');
    end if;
    checked := checked || jsonb_build_object('after_created_at', after_created_at, 'after_id', after_id);
  end if;

  if checked ? 'deck_id' and not exists (select 1 from public.decks deck where deck.id = (checked ->> 'deck_id')::uuid) then
    perform private.raise_deck_not_found();
  end if;
  return checked;
end;
$$;

grant execute on function private.checked_plan_query(jsonb, text, text[]) to authenticated;

create function private.plan_page(page_rows jsonb, page_size integer, query_hash text, id_field text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when jsonb_array_length(page_rows) > page_size then jsonb_build_object(
      'items', page_rows - page_size,
      'next_cursor', private.page_cursor(
        query_hash,
        jsonb_build_array(page_rows -> (page_size - 1) -> 'created_at', page_rows -> (page_size - 1) -> id_field)
      )
    )
    else jsonb_build_object('items', page_rows, 'next_cursor', null)
  end;
$$;

grant execute on function private.plan_page(jsonb, integer, text, text) to authenticated;

create or replace function public.list_planned_swaps(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  oldest_first boolean;
  after_created_at timestamptz;
  after_id uuid;
  page_rows jsonb;
begin
  perform private.caller_user_id();
  checked := private.checked_plan_query(query, 'planned swaps', enum_range(null::public.planned_swap_status)::text[]);
  oldest_first := checked ->> 'order' = 'oldest_first';
  after_created_at := (checked ->> 'after_created_at')::timestamptz;
  after_id := (checked ->> 'after_id')::uuid;

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
      where (not checked ? 'deck_id' or listed.deck_id = (checked ->> 'deck_id')::uuid)
        and (not checked ? 'status' or listed.status = (checked ->> 'status')::public.planned_swap_status)
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
      limit (checked ->> 'limit')::integer + 1
    ) swap
    join public.decks deck on deck.user_id = swap.user_id and deck.id = swap.deck_id;

  return private.plan_page(page_rows, (checked ->> 'limit')::integer, checked ->> 'query_hash', 'planned_swap_id');
end;
$$;

create function private.planned_card_line(card_oracle_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'kind', 'card',
    'oracle_id', card.oracle_id,
    'name', card.name,
    'image_uris', coalesce(to_jsonb(printing.image_uris), '[]'::jsonb),
    'type_line', card.type_line
  )
  from public.cards card
  left join public.card_printings printing on printing.id = private.default_printing_id(card.oracle_id)
  where card.oracle_id = card_oracle_id;
$$;

grant execute on function private.planned_card_line(uuid) to authenticated;

create function public.list_buylist(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  oldest_first boolean;
  after_created_at timestamptz;
  after_id uuid;
  page_rows jsonb;
begin
  perform private.caller_user_id();
  checked := private.checked_plan_query(query, 'buylist', enum_range(null::public.buylist_card_status)::text[]);
  oldest_first := checked ->> 'order' = 'oldest_first';
  after_created_at := (checked ->> 'after_created_at')::timestamptz;
  after_id := (checked ->> 'after_id')::uuid;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'buylist_card_id', card.id,
      'deck_id', card.deck_id,
      'deck_name', deck.name,
      'commander_art_crop_uri', private.deck_row(deck) -> 'commanders' -> 0 -> 'art_crop_uri',
      'incoming', private.planned_card_line(card.incoming_oracle_id),
      'outgoing', private.planned_copy_line(card.user_id, card.outgoing_copy_id, card.outgoing_oracle_id),
      'as_commander', card.as_commander,
      'reason', card.reason,
      'status', card.status,
      'close_note', card.close_note,
      'client_name', card.client_name,
      'created_at', card.created_at,
      'status_changed_at', card.status_changed_at,
      'effect', case when card.status = 'open' then private.buylist_card_effect(
        card.user_id, card.deck_id, card.incoming_oracle_id, card.as_commander, card.outgoing_copy_id
      ) end
    )
    order by
      case when oldest_first then card.created_at end,
      case when oldest_first then card.id end,
      card.created_at desc,
      card.id desc
  ), '[]'::jsonb)
    into page_rows
    from (
      select *
      from public.buylist_cards listed
      where (not checked ? 'deck_id' or listed.deck_id = (checked ->> 'deck_id')::uuid)
        and (not checked ? 'status' or listed.status = (checked ->> 'status')::public.buylist_card_status)
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
      limit (checked ->> 'limit')::integer + 1
    ) card
    join public.decks deck on deck.user_id = card.user_id and deck.id = card.deck_id;

  return private.plan_page(page_rows, (checked ->> 'limit')::integer, checked ->> 'query_hash', 'buylist_card_id');
end;
$$;

revoke all on function public.list_buylist(jsonb) from public, anon, service_role;
grant execute on function public.list_buylist(jsonb) to authenticated;

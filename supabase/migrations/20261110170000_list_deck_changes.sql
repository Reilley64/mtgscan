alter table public.deck_changes
  add column reverted_by uuid,
  add foreign key (user_id, reverted_by) references public.deck_changes (user_id, id);

create function private.basic_land_cards()
returns table (kind_order integer, name text, oracle_id uuid, image_uris text[])
language sql
stable
set search_path = ''
as $$
  select kind.kind_order, kind.name, land.oracle_id, land.image_uris
  from private.basic_land_kinds() kind
  left join lateral (
    select card.oracle_id, printing.image_uris
    from public.cards card
    join public.card_printings printing on printing.oracle_id = card.oracle_id
    where card.name = kind.name and card.absent_since is null and printing.absent_since is null
    order by printing.lang = 'en' desc, printing.released_at desc, printing.set_code, printing.collector_number
    limit 1
  ) land on true;
$$;

grant execute on function private.basic_land_cards() to authenticated;

create function private.deck_change_lines(owner_id uuid, change_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'kind', 'copy',
        'copy_id', line.copy_id,
        'name', card.name,
        'image_uris', to_jsonb(printing.image_uris),
        'type_line', card.type_line,
        'place_before', line.place_before,
        'place_after', line.place_after
      )
      order by card.name, line.copy_id
    )
    from public.deck_change_lines line
    join public.card_printings printing on printing.id = line.card_printing_id
    join public.cards card on card.oracle_id = printing.oracle_id
    where line.user_id = owner_id and line.deck_change_id = change_id
  ), '[]'::jsonb) || coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'kind', 'basic_land',
        'oracle_id', line.oracle_id,
        'name', land.name,
        'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb),
        'count_before', line.count_before,
        'count_after', line.count_after
      )
      order by land.kind_order
    )
    from public.deck_change_basic_lands line
    join private.basic_land_cards() land on land.oracle_id = line.oracle_id
    where line.user_id = owner_id and line.deck_change_id = change_id
  ), '[]'::jsonb);
$$;

grant execute on function private.deck_change_lines(uuid, uuid) to authenticated;

create function private.check_deck_changes_query(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  checked_value jsonb;
  field text;
  value jsonb;
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    checked_value := case
      when field = 'deck_id' then
        private.checked_uuid(field, value)
      when field = 'limit' then
        private.checked_integer(field, value, 1, 50)
      when field = 'cursor' then
        case when jsonb_typeof(value) in ('string', 'null') then value end
    end;
    if checked_value is null then
      if field = 'cursor' then
        perform private.invalid_argument(field, 'cursor must be a string or null.');
      else
        perform private.invalid_argument(field, format('%s is not a known field.', field));
      end if;
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'deck_id' then
    perform private.invalid_argument('deck_id', 'deck_id is required.');
  end if;
  return jsonb_build_object('limit', 20) || checked;
end;
$$;

grant execute on function private.check_deck_changes_query(jsonb) to authenticated;

create function public.list_deck_changes(query jsonb)
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

revoke all on function public.list_deck_changes(jsonb) from public, anon, service_role;
grant execute on function public.list_deck_changes(jsonb) to authenticated;

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

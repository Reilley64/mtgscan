create function private.checked_uuid(field text, value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'string'
    or (value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform private.invalid_argument(field, format('%s must be a UUID.', field));
  end if;
  return to_jsonb((value #>> '{}')::uuid);
end;
$$;

create function private.checked_uuid_list(field text, value jsonb, max_items integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  normalized jsonb;
begin
  perform private.checked_list(field, value, 1, max_items);
  normalized := (
    select jsonb_agg(private.checked_uuid(format('%s[%s]', field, e.ordinality - 1), e.element) order by e.ordinality)
    from jsonb_array_elements(value) with ordinality as e(element, ordinality)
  );
  perform private.checked_list(field, normalized, 1, max_items);
  return normalized;
end;
$$;

create function private.check_card_details_query(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  field text;
  value jsonb;
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    if field not in ('oracle_ids', 'printing_ids') then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, private.checked_uuid_list(field, value, 20));
  end loop;

  if checked ? 'oracle_ids' and checked ? 'printing_ids' then
    perform private.invalid_argument('printing_ids', 'printing_ids cannot be used together with oracle_ids.');
  end if;
  if checked = '{}' then
    perform private.invalid_argument(null, 'Give oracle_ids or printing_ids.');
  end if;
  return checked;
end;
$$;

create function private.check_card_printings_query(query jsonb)
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
      when field = 'oracle_id' then
        private.checked_uuid(field, value)
      when field = 'owned_only' then
        private.checked_boolean(field, value)
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

  if not checked ? 'oracle_id' then
    perform private.invalid_argument('oracle_id', 'oracle_id is required.');
  end if;
  return jsonb_build_object('owned_only', false, 'limit', 20) || checked;
end;
$$;

create function private.page_cursor(query_hash text, last_key jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select translate(
    encode(
      convert_to(
        jsonb_build_object(
          'query_hash', query_hash,
          'issued_at', extract(epoch from now()),
          'after', last_key
        )::text,
        'UTF8'
      ),
      'base64'
    ),
    E'\n',
    ''
  );
$$;

create function private.read_page_cursor(encoded_cursor text, query_hash text, key_length integer)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  payload jsonb;
  issued_at double precision;
begin
  begin
    payload := convert_from(decode(encoded_cursor, 'base64'), 'UTF8')::jsonb;
    issued_at := (payload ->> 'issued_at')::double precision;
    if issued_at is null
      or jsonb_typeof(payload -> 'after') is distinct from 'array'
      or jsonb_array_length(payload -> 'after') <> key_length then
      payload := null;
    end if;
  exception when others then
    payload := null;
  end;

  if payload is null then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor is not valid. Start again without a cursor.',
      'cursor'
    );
  end if;
  if payload ->> 'query_hash' is distinct from read_page_cursor.query_hash then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor belongs to another query. Start again without a cursor.',
      'cursor'
    );
  end if;
  if issued_at < extract(epoch from now() - interval '15 minutes') then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor has expired. Start again without a cursor.',
      'cursor'
    );
  end if;
  return payload -> 'after';
end;
$$;

create function private.rules_data_as_of()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  freshness record;
begin
  select f.snapshot_at, f.is_stale into freshness from public.catalog_freshness() f where f.source = 'catalog';
  if freshness.snapshot_at is null then
    perform private.raise_search_error(
      'data_unavailable',
      'No card catalog import has succeeded yet. Try again later.'
    );
  end if;
  return jsonb_build_object('rules_data_as_of', freshness.snapshot_at, 'rules_stale', freshness.is_stale);
end;
$$;

create function private.card_printing_fields(printing public.card_printings)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'printing_id', printing.id,
    'set', printing.set_code,
    'set_name', printing.set_name,
    'collector_number', printing.collector_number,
    'rarity', printing.rarity,
    'released_at', printing.released_at,
    'finishes', to_jsonb(printing.finishes),
    'image_uris', to_jsonb(printing.image_uris)
  );
$$;

create function private.card_details_row(card public.cards, printing public.card_printings)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'oracle_id', card.oracle_id,
    'name', card.name,
    'mana_cost', card.mana_cost,
    'mana_value', card.mana_value,
    'type_line', card.type_line,
    'oracle_text', card.oracle_text,
    'colors', to_jsonb(card.colors),
    'color_identity', to_jsonb(card.color_identity),
    'keywords', to_jsonb(card.keywords),
    'faces', (
      select coalesce(jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'name', f.name,
          'mana_cost', f.mana_cost,
          'type_line', f.type_line,
          'oracle_text', f.oracle_text,
          'colors', to_jsonb(f.colors),
          'power', f.power,
          'toughness', f.toughness,
          'loyalty', f.loyalty
        ))
        order by f.face_index
      ), '[]'::jsonb)
      from public.card_faces f
      where f.oracle_id = card.oracle_id
    ),
    'commander_legality', card.commander_legality,
    'can_be_commander', card.can_be_commander,
    'is_game_changer', card.is_game_changer,
    'edhrec_rank', card.edhrec_rank,
    'released_at', card.released_at,
    'printing_count', (
      select count(*)
      from public.card_printings p
      where p.oracle_id = card.oracle_id and p.absent_since is null
    ),
    'price_from', null,
    'owned', jsonb_build_object('quantity', 0, 'free_quantity', 0, 'protected_free_quantity', 0)
  ) || case
    when printing.id is null then '{}'::jsonb
    else jsonb_build_object('printing', private.card_printing_fields(printing))
  end;
$$;

create function public.get_cards(query jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  data_as_of jsonb;
  checked jsonb;
  by_printing boolean;
  items jsonb;
  not_found jsonb;
begin
  data_as_of := private.rules_data_as_of();
  checked := private.check_card_details_query(query);
  by_printing := checked ? 'printing_ids';

  select
    coalesce(jsonb_agg(private.card_details_row(c, p) order by r.ordinality) filter (where c.oracle_id is not null), '[]'::jsonb),
    coalesce(jsonb_agg(r.id order by r.ordinality) filter (where c.oracle_id is null), '[]'::jsonb)
  into items, not_found
  from jsonb_array_elements_text(
    checked -> case when by_printing then 'printing_ids' else 'oracle_ids' end
  ) with ordinality as r(id, ordinality)
  left join public.card_printings p on by_printing and p.id = r.id::uuid
  left join public.cards c on c.oracle_id = case when by_printing then p.oracle_id else r.id::uuid end;

  return jsonb_build_object('items', items, 'not_found', not_found) || data_as_of;
end;
$$;

create function public.list_card_printings(query jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  data_as_of jsonb;
  checked jsonb;
  card_oracle_id uuid;
  page_size integer;
  query_hash text;
  after_key jsonb;
  after_released_at date;
  after_set_code text;
  after_collector_number text;
  after_id uuid;
  page_rows public.card_printings[];
  last_row public.card_printings;
  items jsonb;
  next_cursor text;
begin
  data_as_of := private.rules_data_as_of();
  checked := private.check_card_printings_query(query);
  card_oracle_id := (checked ->> 'oracle_id')::uuid;
  if not exists (select 1 from public.cards c where c.oracle_id = card_oracle_id) then
    perform private.raise_search_error('not_found', 'oracle_id is not a card in the card catalog.', 'oracle_id');
  end if;

  page_size := (checked ->> 'limit')::integer;
  query_hash := md5('card printings ' || (checked - array['cursor', 'limit'])::text);
  if jsonb_typeof(checked -> 'cursor') = 'string' then
    after_key := private.read_page_cursor(checked ->> 'cursor', query_hash, 4);
    begin
      after_released_at := (after_key ->> 0)::date;
      after_set_code := after_key ->> 1;
      after_collector_number := after_key ->> 2;
      after_id := (after_key ->> 3)::uuid;
    exception when others then
      after_id := null;
    end;
    if num_nulls(after_released_at, after_set_code, after_collector_number, after_id) > 0 then
      perform private.raise_search_error(
        'invalid_cursor',
        'The cursor is not valid. Start again without a cursor.',
        'cursor'
      );
    end if;
  end if;

  page_rows := array(
    select p
    from public.card_printings p
    where p.oracle_id = card_oracle_id
      and p.absent_since is null
      and not (checked ->> 'owned_only')::boolean
      and (
        after_key is null
        or p.released_at < after_released_at
        or (
          p.released_at = after_released_at
          and (p.set_code, p.collector_number, p.id) > (after_set_code, after_collector_number, after_id)
        )
      )
    order by p.released_at desc, p.set_code, p.collector_number, p.id
    limit page_size + 1
  );

  if cardinality(page_rows) > page_size then
    last_row := page_rows[page_size];
    next_cursor := private.page_cursor(
      query_hash,
      jsonb_build_array(last_row.released_at, last_row.set_code, last_row.collector_number, last_row.id)
    );
  end if;

  select coalesce(jsonb_agg(
    private.card_printing_fields(page_rows[i]) || jsonb_build_object('owned_quantity', 0)
    order by i
  ), '[]'::jsonb)
  into items
  from generate_series(1, least(cardinality(page_rows), page_size)) as i;

  return jsonb_build_object('items', items, 'next_cursor', next_cursor) || data_as_of;
end;
$$;

revoke all on function public.get_cards(jsonb) from public, anon, service_role;
revoke all on function public.list_card_printings(jsonb) from public, anon, service_role;
grant execute on function public.get_cards(jsonb) to authenticated;
grant execute on function public.list_card_printings(jsonb) to authenticated;

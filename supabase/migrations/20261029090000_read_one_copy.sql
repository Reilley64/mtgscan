create function private.price_json(cents integer, currency public.price_currency, finish public.card_finish)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when cents is not null then jsonb_build_object(
    'amount', (cents / 100.0)::numeric(10, 2)::text,
    'currency', currency,
    'finish', finish
  ) end;
$$;

create function private.copy_row(
  a private.collection_availability,
  p public.card_printings,
  c public.cards,
  price public.card_prices,
  currency public.price_currency,
  prices_stale boolean
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'copy_id', a.copy_id,
    'printing_id', p.id,
    'name', c.name,
    'set', p.set_code,
    'collector_number', p.collector_number,
    'rarity', p.rarity,
    'image_uris', to_jsonb(p.image_uris),
    'finish', a.finish,
    'condition', a.condition,
    'language', a.language,
    'protected', a.is_protected,
    'price', private.price_json(private.finish_price_cents(price, a.finish, currency), currency, a.finish)
      || jsonb_build_object('stale', prices_stale)
  );
$$;

grant execute on function
  private.price_json(integer, public.price_currency, public.card_finish),
  private.copy_row(
    private.collection_availability,
    public.card_printings,
    public.cards,
    public.card_prices,
    public.price_currency,
    boolean
  )
to authenticated, service_role;

create or replace function private.run_search(api public.search_api, query jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  telemetry_ids constant integer := 20;
  rules_freshness record;
  prices_freshness record;
  checked jsonb;
  searched boolean;
  row_kind text;
  currency text;
  query_hash text;
  page_size integer;
  sort text;
  descending boolean;
  sign text;
  search_id uuid;
  after_key jsonb;
  conditions text[];
  matched_text record;
  price_cents text;
  released_at text;
  sort_columns text;
  direction text;
  collection_rows text;
  matches text;
  page_keys jsonb;
  page_quantities jsonb;
  total_count bigint;
  result_ids uuid[];
  page_ids uuid[];
  items jsonb;
  next_cursor text;
begin
  select * into rules_freshness from public.catalog_freshness() f where f.source = 'catalog';
  select * into prices_freshness from public.catalog_freshness() f where f.source = 'prices';
  if rules_freshness.snapshot_at is null then
    perform private.raise_search_error(
      'data_unavailable',
      'No card catalog import has succeeded yet. Try again later.'
    );
  end if;

  checked := private.check_search_query(coalesce(query, '{}'), api);
  searched := exists (
    select 1
    from jsonb_object_keys(checked) as field
    where field not in ('rows', 'sort', 'sort_order', 'limit', 'include_oracle_text', 'cursor', 'price_currency')
  );
  if api = 'catalog' and not searched then
    perform private.raise_search_error(
      'invalid_argument',
      'Catalog search needs text or at least one filter.'
    );
  end if;

  row_kind := checked ->> 'rows';
  currency := checked ->> 'price_currency';
  page_size := (checked ->> 'limit')::integer;
  query_hash := md5(api || ' ' || (checked - array['cursor', 'limit', 'include_oracle_text'])::text);
  if jsonb_typeof(checked -> 'cursor') = 'string' then
    select c.search_id, c.after_key into search_id, after_key
      from private.read_search_cursor(checked ->> 'cursor', query_hash) c;
  else
    search_id := gen_random_uuid();
  end if;

  if api = 'catalog' then
    conditions := private.catalog_filter_conditions(checked);
    price_cents := format(
      '(select lp.amount_cents from public.card_lowest_prices lp where lp.oracle_id = c.oracle_id and lp.currency = %L)',
      currency
    );
    released_at := 'c.released_at';
  else
    conditions := private.collection_filter_conditions(checked);
    price_cents := format('private.finish_price_cents(price, a.finish, %L)', currency);
    released_at := 'p.released_at';
  end if;
  select * into matched_text from private.text_search(checked);
  if matched_text.condition is not null then
    conditions := conditions || matched_text.condition;
  end if;

  sort := checked ->> 'sort';
  if sort = 'relevance' and not checked ? 'text' then
    sort := 'added';
  end if;
  descending := checked ->> 'sort_order' = 'desc';
  sign := case when descending then '-' else '' end;
  sort_columns := case sort
    when 'relevance' then format('false, %s, %s', matched_text.tier, matched_text.text_rank)
    when 'name' then 'false, 0, 0'
    when 'mana_value' then format('false, %sc.mana_value, 0', sign)
    when 'edhrec_rank' then format('c.edhrec_rank is null, coalesce(%sc.edhrec_rank, 0), 0', sign)
    when 'release_date' then format('false, %s(%s - date ''1970-01-01''), 0', sign, released_at)
    when 'price' then format('%1$s is null, coalesce(%2$s%1$s, 0), 0', price_cents, sign)
    when 'added' then format('false, %sextract(epoch from a.printing_added_at), 0', sign)
  end;
  direction := case
    when sort = 'relevance' and not descending then 'desc'
    when sort = 'name' and descending then 'desc'
    else 'asc'
  end;

  if api = 'catalog' then
    matches := format(
      'select c.oracle_id as row_id, c.oracle_id as group_id, null::jsonb as quantities, c.name_key, keys.* '
      'from public.cards c '
      'cross join lateral (select %s) as keys(sort_flag, sort_primary, sort_secondary) '
      'where %s',
      sort_columns,
      array_to_string(array['true'] || conditions, ' and ')
    );
  else
    collection_rows := format(
      'select %s '
      'from private.collection_availability a '
      'join public.copies copy on copy.user_id = a.user_id and copy.id = a.copy_id '
      'join public.collection_additions addition on addition.id = copy.addition_id '
      'join public.card_printings p on p.id = a.card_printing_id '
      'join public.cards c on c.oracle_id = p.oracle_id '
      'left join public.card_prices price on price.printing_id = p.id '
      'where %s',
      case row_kind
        when 'copies' then
          'a.copy_id as row_id, a.card_printing_id, a.finish, null::jsonb as quantities, '
          'max(addition.added_at) over (partition by a.card_printing_id) as printing_added_at'
        else
          'min(a.copy_id::text)::uuid as row_id, a.card_printing_id, a.finish, '
          'jsonb_build_object('
          '''quantity'', count(*), '
          '''free_quantity'', count(*) filter (where a.is_free), '
          '''allocated_quantity'', count(*) filter (where a.is_allocated), '
          '''held_quantity'', count(*) filter (where a.is_held)'
          ') as quantities, '
          'max(max(addition.added_at)) over (partition by a.card_printing_id) as printing_added_at'
      end,
      array_to_string(array['true'] || conditions, ' and ')
    ) || case
      when row_kind = 'entries' then ' group by a.card_printing_id, a.finish, a.condition, a.language, a.is_protected'
      else ''
    end;
    matches := format(
      'select a.row_id, a.card_printing_id as group_id, a.quantities, c.name_key, keys.* '
      'from (%s) a '
      'join public.card_printings p on p.id = a.card_printing_id '
      'join public.cards c on c.oracle_id = p.oracle_id '
      'left join public.card_prices price on price.printing_id = p.id '
      'cross join lateral (select %s) as keys(sort_flag, sort_primary, sort_secondary)',
      collection_rows,
      sort_columns
    );
  end if;

  execute format(
    $sql$
      with matches as (%1$s),
      page as (
        select m.*, count(*) over () as total_count
        from matches m
        where $1 is null
          or (m.sort_flag, m.sort_primary, m.sort_secondary, m.name_key, m.group_id, m.row_id) %2$s (
            ($1 ->> 0)::boolean,
            ($1 ->> 1)::numeric,
            ($1 ->> 2)::numeric,
            $1 ->> 3,
            ($1 ->> 4)::uuid,
            ($1 ->> 5)::uuid
          )
        order by %3$s
        limit %4$s
      )
      select
        coalesce(jsonb_agg(
          jsonb_build_array(p.sort_flag, p.sort_primary, p.sort_secondary, p.name_key, p.group_id, p.row_id)
          order by %3$s
        ), '[]'::jsonb),
        coalesce(jsonb_agg(p.quantities order by %3$s), '[]'::jsonb),
        coalesce(max(p.total_count), 0)
      from page p
    $sql$,
    matches,
    case direction when 'asc' then '>' else '<' end,
    format(
      'sort_flag %1$s, sort_primary %1$s, sort_secondary %1$s, name_key %1$s, group_id %1$s, row_id %1$s',
      direction
    ),
    case when after_key is null then greatest(page_size, telemetry_ids) else page_size end + 1
  )
  into page_keys, page_quantities, total_count
  using after_key;

  result_ids := array(
    select (k.key ->> 5)::uuid
    from jsonb_array_elements(page_keys) with ordinality as k(key, ordinality)
    order by k.ordinality
  );
  page_ids := result_ids[1:page_size];
  if jsonb_array_length(page_keys) > page_size then
    next_cursor := private.search_cursor(search_id, query_hash, page_keys -> (page_size - 1));
  end if;

  select coalesce(jsonb_agg(
    case
      when api = 'catalog' then jsonb_build_object(
        'oracle_id', c.oracle_id,
        'name', c.name,
        'mana_cost', c.mana_cost,
        'mana_value', c.mana_value,
        'type_line', c.type_line,
        'color_identity', to_jsonb(c.color_identity),
        'is_game_changer', coalesce(c.is_game_changer, false),
        'can_be_commander', c.can_be_commander,
        'edhrec_rank', c.edhrec_rank,
        'price_from', private.price_from(c.oracle_id, currency::public.price_currency),
        'owned', private.owned_copies(c.oracle_id)
      )
      when row_kind = 'copies' then
        private.copy_row(a, p, c, price, currency::public.price_currency, prices_freshness.is_stale)
      else jsonb_build_object(
        'oracle_id', c.oracle_id,
        'printing_id', p.id,
        'name', c.name,
        'set', p.set_code,
        'collector_number', p.collector_number,
        'finish', a.finish,
        'language', a.language,
        'condition', a.condition,
        'protected', a.is_protected,
        'commander_legal', c.commander_legality = 'legal'
      ) || (page_quantities -> (page.ordinality::integer - 1))
    end || case
      when (checked ->> 'include_oracle_text')::boolean then jsonb_build_object('oracle_text', c.oracle_text)
      else '{}'::jsonb
    end
    order by page.ordinality
  ), '[]'::jsonb)
  into items
  from unnest(page_ids) with ordinality as page(row_id, ordinality)
  left join private.collection_availability a on api = 'collection' and a.copy_id = page.row_id
  left join public.card_printings p on p.id = a.card_printing_id
  join public.cards c on c.oracle_id = case api when 'catalog' then page.row_id else p.oracle_id end
  left join public.card_prices price on price.printing_id = p.id;

  if after_key is null and searched then
    perform private.record_search(
      search_id,
      api,
      checked - 'cursor',
      total_count,
      extract(epoch from clock_timestamp() - started_at) * 1000,
      result_ids[1:telemetry_ids]
    );
  end if;

  return jsonb_build_object(
    'items', items,
    'next_cursor', next_cursor,
    'search_id', search_id,
    'rules_data_as_of', rules_freshness.snapshot_at,
    'rules_stale', rules_freshness.is_stale,
    'prices_observed_at', prices_freshness.snapshot_at,
    'prices_stale', prices_freshness.is_stale
  );
end;
$$;

create function private.check_copy_query(query jsonb)
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
      when field = 'copy_id' then
        private.checked_uuid(field, value)
      when field = 'price_currency' then
        private.checked_choice(field, value, enum_range(null::public.price_currency)::text[])
    end;
    if checked_value is null then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'copy_id' then
    perform private.invalid_argument('copy_id', 'copy_id is required.');
  end if;
  return jsonb_build_object('price_currency', 'USD') || checked;
end;
$$;

grant execute on function private.check_copy_query(jsonb) to authenticated;

create function public.get_copy(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  chosen_currency public.price_currency;
  prices_stale boolean;
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_copy_query(query);
  chosen_currency := (checked ->> 'price_currency')::public.price_currency;
  select f.is_stale into prices_stale from public.catalog_freshness() f where f.source = 'prices';

  select private.copy_row(a, p, c, price, chosen_currency, prices_stale) || jsonb_build_object(
    'free', a.is_free,
    'added_at', addition.added_at,
    'purchase_day_price', private.price_json(
      case chosen_currency
        when 'USD' then line.purchase_day_usd_cents
        when 'EUR' then line.purchase_day_eur_cents
      end,
      chosen_currency,
      a.finish
    ),
    'type_line', c.type_line,
    'faces', coalesce((
      select jsonb_agg(jsonb_build_object('name', f.name, 'oracle_text', f.oracle_text) order by f.face_index)
      from public.card_faces f
      where f.oracle_id = c.oracle_id
    ), '[]'::jsonb),
    'commander_legality', c.commander_legality
  )
  into result
  from private.collection_availability a
  join public.copies copy on copy.user_id = a.user_id and copy.id = a.copy_id
  join public.collection_additions addition on addition.id = copy.addition_id
  join public.collection_addition_lines line
    on (line.addition_id, line.card_printing_id, line.finish, line.condition, line.language)
      = (copy.addition_id, copy.card_printing_id, copy.finish, copy.condition, copy.language)
  join public.card_printings p on p.id = a.card_printing_id
  join public.cards c on c.oracle_id = p.oracle_id
  left join public.card_prices price on price.printing_id = p.id
  where a.copy_id = (checked ->> 'copy_id')::uuid;

  if result is null then
    perform private.raise_search_error('not_found', 'copy_id is not a copy in your collection.', 'copy_id');
  end if;
  return result;
end;
$$;

revoke all on function public.get_copy(jsonb) from public, anon, service_role;
grant execute on function public.get_copy(jsonb) to authenticated;

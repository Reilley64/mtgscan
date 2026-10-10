create or replace function public.search_catalog(query jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  telemetry_ids constant integer := 20;
  rules_freshness record;
  prices_freshness record;
  checked jsonb;
  query_hash text;
  page_size integer;
  descending boolean;
  sign text;
  search_id uuid;
  after_key jsonb;
  conditions text[];
  text_key text;
  text_query text;
  name_match text;
  tag_match text;
  tier text := '0';
  text_rank text := '0';
  sort_columns text;
  direction text;
  page_keys jsonb;
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

  checked := private.check_search_query(coalesce(query, '{}'));
  if not exists (
    select 1
    from jsonb_object_keys(checked) as field
    where field not in ('sort', 'sort_order', 'limit', 'include_oracle_text', 'cursor', 'price_currency')
  ) then
    perform private.raise_search_error(
      'invalid_argument',
      'Catalog search needs text or at least one filter.'
    );
  end if;

  page_size := (checked ->> 'limit')::integer;
  query_hash := md5('catalog ' || (checked - array['cursor', 'limit', 'include_oracle_text'])::text);
  if jsonb_typeof(checked -> 'cursor') = 'string' then
    select c.search_id, c.after_key into search_id, after_key
      from private.read_search_cursor(checked ->> 'cursor', query_hash) c;
  else
    search_id := gen_random_uuid();
  end if;

  conditions := private.catalog_filter_conditions(checked);
  if checked ? 'text' then
    text_key := private.name_key(checked ->> 'text');
    text_query := plainto_tsquery('english', checked ->> 'text')::text;
    name_match := format(
      'case when c.name_key = %1$L then 0 '
      'when %1$L = any (string_to_array(c.name_key, ''/'')) then 1 '
      'when c.name_key like %2$L then 2 ',
      text_key,
      '%' || text_key || '%'
    );
    if numnode(text_query::tsquery) > 0 then
      tag_match := private.tagged_cards_condition(format(
        'select t.id from public.oracle_tags t where t.search_vector @@ %1$L::tsquery '
        'or %2$L = any (t.label_keys) or %2$L = any (t.alias_keys)',
        text_query,
        text_key
      ));
      conditions := conditions || format(
        '(c.name_key like %L or c.search_vector @@ %L::tsquery or %s)',
        '%' || text_key || '%',
        text_query,
        tag_match
      );
      text_rank := format('-ts_rank(c.search_vector, %L::tsquery)::numeric', text_query);
      tier := name_match || format(
        'when ts_filter(c.search_vector, ''{a}'') @@ %1$L::tsquery then 2 '
        'when %2$s then 3 '
        'when ts_filter(c.search_vector, ''{c}'') @@ %1$L::tsquery then 4 else 5 end',
        text_query,
        tag_match
      );
    else
      conditions := conditions || format('c.name_key like %L', '%' || text_key || '%');
      tier := name_match || 'end';
    end if;
  end if;

  descending := checked ->> 'sort_order' = 'desc';
  sign := case when descending then '-' else '' end;
  sort_columns := case checked ->> 'sort'
    when 'relevance' then format('false, %s, %s', tier, text_rank)
    when 'name' then 'false, 0, 0'
    when 'mana_value' then format('false, %sc.mana_value, 0', sign)
    when 'edhrec_rank' then format('c.edhrec_rank is null, coalesce(%sc.edhrec_rank, 0), 0', sign)
    when 'release_date' then format('false, %s(c.released_at - date ''1970-01-01''), 0', sign)
    when 'price' then format(
      '%1$s is null, coalesce(%2$s%1$s, 0), 0',
      format(
        '(select lp.amount_cents from public.card_lowest_prices lp where lp.oracle_id = c.oracle_id and lp.currency = %L)',
        checked ->> 'price_currency'
      ),
      sign
    )
  end;
  direction := case
    when checked ->> 'sort' = 'relevance' and not descending then 'desc'
    when checked ->> 'sort' = 'name' and descending then 'desc'
    else 'asc'
  end;

  execute format(
    $sql$
      with matches as (
        select c.oracle_id, c.name_key, keys.sort_flag, keys.sort_primary, keys.sort_secondary
        from public.cards c
        cross join lateral (select %1$s) as keys(sort_flag, sort_primary, sort_secondary)
        where %2$s
      ),
      page as (
        select m.*, count(*) over () as total_count
        from matches m
        where $1 is null
          or (m.sort_flag, m.sort_primary, m.sort_secondary, m.name_key, m.oracle_id) %3$s (
            ($1 ->> 0)::boolean, ($1 ->> 1)::numeric, ($1 ->> 2)::numeric, $1 ->> 3, ($1 ->> 4)::uuid
          )
        order by %4$s
        limit %5$s
      )
      select
        coalesce(jsonb_agg(
          jsonb_build_array(p.sort_flag, p.sort_primary, p.sort_secondary, p.name_key, p.oracle_id)
          order by %4$s
        ), '[]'::jsonb),
        coalesce(max(p.total_count), 0)
      from page p
    $sql$,
    sort_columns,
    array_to_string(conditions, ' and '),
    case direction when 'asc' then '>' else '<' end,
    format(
      'sort_flag %1$s, sort_primary %1$s, sort_secondary %1$s, name_key %1$s, oracle_id %1$s',
      direction
    ),
    case when after_key is null then greatest(page_size, telemetry_ids) else page_size end + 1
  )
  into page_keys, total_count
  using after_key;

  result_ids := array(
    select (k.key ->> 4)::uuid
    from jsonb_array_elements(page_keys) with ordinality as k(key, ordinality)
    order by k.ordinality
  );
  page_ids := result_ids[1:page_size];
  if jsonb_array_length(page_keys) > page_size then
    next_cursor := private.search_cursor(search_id, query_hash, page_keys -> (page_size - 1));
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'oracle_id', c.oracle_id,
      'name', c.name,
      'mana_cost', c.mana_cost,
      'mana_value', c.mana_value,
      'type_line', c.type_line,
      'color_identity', to_jsonb(c.color_identity),
      'is_game_changer', coalesce(c.is_game_changer, false),
      'can_be_commander', c.can_be_commander,
      'edhrec_rank', c.edhrec_rank,
      'price_from', private.price_from(c.oracle_id, (checked ->> 'price_currency')::public.price_currency),
      'owned', jsonb_build_object('quantity', 0, 'free_quantity', 0, 'protected_free_quantity', 0)
    ) || case
      when (checked ->> 'include_oracle_text')::boolean then jsonb_build_object('oracle_text', c.oracle_text)
      else '{}'::jsonb
    end
    order by page.ordinality
  ), '[]'::jsonb)
  into items
  from unnest(page_ids) with ordinality as page(oracle_id, ordinality)
  join public.cards c on c.oracle_id = page.oracle_id;

  if after_key is null then
    perform private.record_search(
      search_id,
      'catalog',
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

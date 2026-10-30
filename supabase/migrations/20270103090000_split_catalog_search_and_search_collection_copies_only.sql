drop function private.collection_entry_price_and_total(public.card_prices, public.card_finish, integer, boolean);

create or replace function private.check_search_query(query jsonb, api public.search_api)
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
  bound text;
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    checked_value := case
      when field = 'text' then
        private.checked_text(field, value, 200)
      when field in ('names', 'names_exclude', 'types', 'types_exclude') then
        private.checked_text_list(field, value)
      when field in ('colors', 'colors_exclude') then
        private.checked_choice_list(field, value, array['W', 'U', 'B', 'R', 'G', 'C'], 1)
      when field = 'identity_subset_of' then
        private.checked_choice_list(field, value, array['W', 'U', 'B', 'R', 'G'], 0)
      when field in ('mana_value_min', 'mana_value_max') then
        private.checked_integer(field, value, 0, 20)
      when field in ('power_min', 'power_max', 'toughness_min', 'toughness_max') then
        private.checked_number(field, value, -99, 99)
      when field in ('keywords', 'keywords_exclude') then
        private.checked_catalog_values(field, value, 'keyword')
      when field in ('sets', 'sets_exclude') then
        private.checked_catalog_values(field, value, 'set')
      when field in ('price_min', 'price_max') then
        private.checked_price(field, value)
      when field in ('tags', 'tags_exclude') then
        private.checked_tag_slugs(field, value)
      when field in ('rarities', 'rarities_exclude') then
        private.checked_choice_list(field, value, enum_range(null::public.card_rarity)::text[], 1)
      when field in ('is_commander', 'is_game_changer', 'include_oracle_text') then
        private.checked_boolean(field, value)
      when api = 'collection' and field in ('finishes', 'finishes_exclude') then
        private.checked_choice_list(field, value, enum_range(null::public.card_finish)::text[], 1)
      when api = 'collection' and field in ('conditions', 'conditions_exclude') then
        private.checked_choice_list(field, value, enum_range(null::public.card_condition)::text[], 1)
      when api = 'collection' and field in ('languages', 'languages_exclude') then
        private.checked_choice_list(field, value, enum_range(null::public.card_language)::text[], 1)
      when api = 'collection' and field in ('deck_ids', 'deck_ids_exclude') then
        private.checked_deck_ids(field, value)
      when api = 'collection' and field in ('is_free', 'is_protected', 'is_allocated') then
        private.checked_boolean(field, value)
      when api = 'collection' and field in ('user_tags', 'user_tags_exclude') then
        private.checked_user_tag_names(field, value)
      when field = 'sort' then
        private.checked_choice(
          field,
          value,
          array['relevance', 'name', 'mana_value', 'edhrec_rank', 'price', 'release_date']
            || case when api = 'collection' then array['added'] else '{}'::text[] end
        )
      when field = 'sort_order' then
        private.checked_choice(field, value, array['asc', 'desc'])
      when field = 'limit' then
        private.checked_integer(field, value, 1, case api when 'collection' then 120 else 50 end)
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

  foreach bound in array array['mana_value', 'power', 'toughness', 'price'] loop
    if (checked ->> (bound || '_min'))::numeric > (checked ->> (bound || '_max'))::numeric then
      perform private.invalid_argument(
        bound || '_max',
        format('%s_max must not be less than %s_min.', bound, bound)
      );
    end if;
  end loop;

  checked := jsonb_build_object(
    'sort', case when api = 'collection' or checked ? 'text' then 'relevance' else 'name' end,
    'limit', case api when 'collection' then 60 else 20 end
  ) || checked;
  if api = 'catalog' and checked ->> 'sort' = 'relevance' and not checked ? 'text' then
    perform private.invalid_argument('sort', 'sort can be relevance only when text is set.');
  end if;

  return jsonb_build_object(
    'sort_order', case when checked ->> 'sort' in ('relevance', 'added') then 'desc' else 'asc' end
  ) || checked;
end;
$$;

create function private.begin_search(
  api public.search_api,
  query jsonb,
  out checked jsonb,
  out searched boolean,
  out query_hash text,
  out search_id uuid,
  out after_key jsonb,
  out rules_snapshot_at timestamptz,
  out rules_stale boolean,
  out prices_snapshot_at timestamptz,
  out prices_stale boolean
)
language plpgsql
volatile
set search_path = ''
as $$
begin
  select f.snapshot_at, f.is_stale into rules_snapshot_at, rules_stale
    from public.catalog_freshness() f where f.source = 'catalog';
  select f.snapshot_at, f.is_stale into prices_snapshot_at, prices_stale
    from public.catalog_freshness() f where f.source = 'prices';
  if rules_snapshot_at is null then
    perform private.raise_search_error(
      'data_unavailable',
      'No card catalog import has succeeded yet. Try again later.'
    );
  end if;

  checked := private.check_search_query(coalesce(query, '{}'), api);
  searched := exists (
    select 1
    from jsonb_object_keys(checked) as field
    where field not in ('sort', 'sort_order', 'limit', 'include_oracle_text', 'cursor')
  );
  query_hash := md5(api || ' ' || (checked - array['cursor', 'limit', 'include_oracle_text'])::text);
  if jsonb_typeof(checked -> 'cursor') = 'string' then
    select c.search_id, c.after_key into search_id, after_key
      from private.read_search_cursor(checked ->> 'cursor', query_hash) c;
  else
    search_id := gen_random_uuid();
  end if;
end;
$$;

create function private.search_sort_columns(
  sort text,
  descending boolean,
  text_tier text,
  text_rank text,
  price_cents text,
  released_at text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case sort
    when 'relevance' then format('false, %s, %s', text_tier, text_rank)
    when 'name' then 'false, 0, 0'
    when 'mana_value' then format('false, %sc.mana_value, 0', case when descending then '-' else '' end)
    when 'edhrec_rank' then format('c.edhrec_rank is null, coalesce(%sc.edhrec_rank, 0), 0', case when descending then '-' else '' end)
    when 'release_date' then format('false, %s(%s - date ''1970-01-01''), 0', case when descending then '-' else '' end, released_at)
    when 'price' then format('%1$s is null, coalesce(%2$s%1$s, 0), 0', price_cents, case when descending then '-' else '' end)
    when 'added' then format('false, %sextract(epoch from a.created_at), 0', case when descending then '-' else '' end)
  end;
$$;

create function private.search_page_keys(
  matches text,
  sort text,
  descending boolean,
  after_key jsonb,
  read_size integer,
  out page_keys jsonb,
  out total_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  direction constant text := case
    when sort = 'relevance' and not descending then 'desc'
    when sort = 'name' and descending then 'desc'
    else 'asc'
  end;
  sort_keys constant text := format(
    'sort_flag %1$s, sort_primary %1$s, sort_secondary %1$s, name_key %1$s, group_id %1$s, row_id %1$s',
    direction
  );
begin
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
        coalesce(max(p.total_count), 0)
      from page p
    $sql$,
    matches,
    case direction when 'asc' then '>' else '<' end,
    sort_keys,
    read_size + 1
  )
  into page_keys, total_count
  using after_key;
end;
$$;

create function private.page_row_ids(page_keys jsonb)
returns uuid[]
language sql
immutable
set search_path = ''
as $$
  select array(
    select (k.key ->> 5)::uuid
    from jsonb_array_elements(page_keys) with ordinality as k(key, ordinality)
    order by k.ordinality
  );
$$;

create function private.run_catalog_search(query jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  telemetry_ids constant integer := 20;
  search record;
  page_size integer;
  matched_text record;
  conditions text[];
  sort text;
  descending boolean;
  page record;
  result_ids uuid[];
  items jsonb;
  next_cursor text;
begin
  select * into search from private.begin_search('catalog', query);
  if not search.searched then
    perform private.raise_search_error(
      'invalid_argument',
      'Catalog search needs text or at least one filter.'
    );
  end if;
  page_size := (search.checked ->> 'limit')::integer;

  select * into matched_text from private.text_search(search.checked);
  conditions := private.catalog_filter_conditions(search.checked);
  if matched_text.condition is not null then
    conditions := conditions || matched_text.condition;
  end if;

  sort := search.checked ->> 'sort';
  descending := search.checked ->> 'sort_order' = 'desc';
  select * into page from private.search_page_keys(
    format(
      'select c.oracle_id as row_id, c.oracle_id as group_id, c.name_key, keys.* '
      'from public.cards c '
      'cross join lateral (select %s) as keys(sort_flag, sort_primary, sort_secondary) '
      'where %s',
      private.search_sort_columns(
        sort,
        descending,
        matched_text.tier,
        matched_text.text_rank,
        '(select lp.usd_cents from public.card_lowest_prices lp where lp.oracle_id = c.oracle_id)',
        'c.released_at'
      ),
      array_to_string(array['true'] || conditions, ' and ')
    ),
    sort,
    descending,
    search.after_key,
    case when search.after_key is null then greatest(page_size, telemetry_ids) else page_size end
  );

  result_ids := private.page_row_ids(page.page_keys);
  if jsonb_array_length(page.page_keys) > page_size then
    next_cursor := private.search_cursor(search.search_id, search.query_hash, page.page_keys -> (page_size - 1));
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
      'price_from', private.price_from(c.oracle_id),
      'owned', private.owned_copies(c.oracle_id)
    ) || case
      when (search.checked ->> 'include_oracle_text')::boolean then jsonb_build_object('oracle_text', c.oracle_text)
      else '{}'::jsonb
    end
    order by page_row.ordinality
  ), '[]'::jsonb)
  into items
  from unnest(result_ids[1:page_size]) with ordinality as page_row(oracle_id, ordinality)
  join public.cards c on c.oracle_id = page_row.oracle_id;

  if search.after_key is null then
    perform private.record_search(
      search.search_id,
      'catalog',
      search.checked - 'cursor',
      page.total_count,
      extract(epoch from clock_timestamp() - started_at) * 1000,
      result_ids[1:telemetry_ids]
    );
  end if;

  return jsonb_build_object(
    'items', items,
    'next_cursor', next_cursor,
    'search_id', search.search_id,
    'rules_data_as_of', search.rules_snapshot_at,
    'rules_stale', search.rules_stale,
    'prices_observed_at', search.prices_snapshot_at,
    'prices_stale', search.prices_stale
  );
end;
$$;

create function private.run_collection_search(query jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  telemetry_ids constant integer := 20;
  search record;
  page_size integer;
  matched_text record;
  conditions text[];
  sort text;
  descending boolean;
  page record;
  result_ids uuid[];
  items jsonb;
  next_cursor text;
  basic_lands jsonb;
begin
  select * into search from private.begin_search('collection', query);
  page_size := (search.checked ->> 'limit')::integer;

  select * into matched_text from private.text_search(search.checked);
  conditions := private.collection_filter_conditions(search.checked);
  if matched_text.condition is not null then
    conditions := conditions || matched_text.condition;
  end if;

  sort := search.checked ->> 'sort';
  if sort = 'relevance' and not search.checked ? 'text' then
    sort := 'added';
  end if;
  descending := search.checked ->> 'sort_order' = 'desc';
  select * into page from private.search_page_keys(
    format(
      'select a.copy_id as row_id, a.card_printing_id as group_id, c.name_key, keys.* '
      'from (select a.*, copy.created_at from private.collection_availability a '
      'join public.copies copy on copy.user_id = a.user_id and copy.id = a.copy_id) a '
      'join public.card_printings p on p.id = a.card_printing_id '
      'join public.cards c on c.oracle_id = p.oracle_id '
      'left join public.card_prices price on price.printing_id = p.id '
      'cross join lateral (select %s) as keys(sort_flag, sort_primary, sort_secondary) '
      'where %s',
      private.search_sort_columns(
        sort,
        descending,
        matched_text.tier,
        matched_text.text_rank,
        'private.finish_price_cents(price, a.finish)',
        'p.released_at'
      ),
      array_to_string(array['true'] || conditions, ' and ')
    ),
    sort,
    descending,
    search.after_key,
    case when search.after_key is null then greatest(page_size, telemetry_ids) else page_size end
  );

  result_ids := private.page_row_ids(page.page_keys);
  if jsonb_array_length(page.page_keys) > page_size then
    next_cursor := private.search_cursor(search.search_id, search.query_hash, page.page_keys -> (page_size - 1));
  end if;

  select coalesce(jsonb_agg(
    private.copy_row(a, p, c, price, search.prices_stale) || jsonb_build_object(
      'deck', (
        select jsonb_build_object('deck_id', deck.id, 'name', deck.name)
        from public.deck_cards deck_card
        join public.decks deck on deck.user_id = deck_card.user_id and deck.id = deck_card.deck_id
        where deck_card.user_id = a.user_id and deck_card.copy_id = a.copy_id
      ),
      'held_for', (
        select jsonb_build_object('deck_id', deck.id, 'name', deck.name)
        from public.planned_swaps swap
        join public.decks deck on deck.user_id = swap.user_id and deck.id = swap.deck_id
        where swap.user_id = a.user_id and swap.incoming_copy_id = a.copy_id and swap.status = 'open'
      ),
      'created_at', copy.created_at
    ) || case
      when (search.checked ->> 'include_oracle_text')::boolean then jsonb_build_object('oracle_text', c.oracle_text)
      else '{}'::jsonb
    end
    order by page_row.ordinality
  ), '[]'::jsonb)
  into items
  from unnest(result_ids[1:page_size]) with ordinality as page_row(copy_id, ordinality)
  join private.collection_availability a on a.copy_id = page_row.copy_id
  join public.copies copy on copy.user_id = a.user_id and copy.id = a.copy_id
  join public.card_printings p on p.id = a.card_printing_id
  join public.cards c on c.oracle_id = p.oracle_id
  left join public.card_prices price on price.printing_id = p.id;

  if search.after_key is null then
    basic_lands := case
      when search.searched or page.total_count > 0 then private.matching_basic_lands(search.checked)
      else '[]'
    end;
    if search.searched then
      perform private.record_search(
        search.search_id,
        'collection',
        search.checked - 'cursor',
        page.total_count,
        extract(epoch from clock_timestamp() - started_at) * 1000,
        result_ids[1:telemetry_ids]
      );
    end if;
  end if;

  return jsonb_build_object(
    'items', items,
    'next_cursor', next_cursor,
    'search_id', search.search_id,
    'rules_data_as_of', search.rules_snapshot_at,
    'rules_stale', search.rules_stale,
    'prices_observed_at', search.prices_snapshot_at,
    'prices_stale', search.prices_stale,
    'total_count', case when search.after_key is null then page.total_count end,
    'basic_lands', basic_lands
  );
end;
$$;

create or replace function public.search_catalog(query jsonb)
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.run_catalog_search(query);
$$;

create or replace function public.search_collection(query jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  return private.run_collection_search(query);
end;
$$;

drop function private.run_search(public.search_api, jsonb);

grant execute on function
  private.begin_search(public.search_api, jsonb),
  private.search_sort_columns(text, boolean, text, text, text, text),
  private.search_page_keys(text, text, boolean, jsonb, integer),
  private.page_row_ids(jsonb),
  private.run_catalog_search(jsonb)
to authenticated, service_role;

grant execute on function private.run_collection_search(jsonb) to authenticated;

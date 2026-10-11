drop function private.check_search_query(jsonb);

create function private.finish_price_cents(
  price public.card_prices,
  finish public.card_finish,
  currency public.price_currency
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case currency
    when 'USD' then case finish
      when 'nonfoil' then price.usd_nonfoil_cents
      when 'foil' then price.usd_foil_cents
      when 'etched' then price.usd_etched_cents
    end
    when 'EUR' then case finish
      when 'nonfoil' then price.eur_nonfoil_cents
      when 'foil' then price.eur_foil_cents
    end
  end;
$$;

create view private.collection_availability with (security_invoker = true) as
select
  entry.id as collection_entry_id,
  entry.user_id,
  entry.card_printing_id,
  printing.oracle_id,
  entry.finish,
  entry.condition,
  entry.language,
  entry.is_protected,
  entry.quantity,
  deck_use.allocated_quantity,
  deck_use.held_quantity,
  greatest(entry.quantity - deck_use.allocated_quantity - deck_use.held_quantity, 0) as free_quantity,
  deck_use.deck_ids
from public.collection_entries entry
join public.card_printings printing on printing.id = entry.card_printing_id
cross join lateral (
  select 0 as allocated_quantity, 0 as held_quantity, '{}'::uuid[] as deck_ids
) deck_use
where entry.user_id = auth.uid();

create function private.owned_copies(oracle_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'quantity', coalesce(sum(a.quantity), 0),
    'free_quantity', coalesce(sum(a.free_quantity), 0),
    'protected_free_quantity', coalesce(sum(a.free_quantity) filter (where a.is_protected), 0)
  )
  from private.collection_availability a
  where a.oracle_id = owned_copies.oracle_id;
$$;

create function private.owned_printing_quantity(printing_id uuid)
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(a.quantity), 0)
  from private.collection_availability a
  where a.card_printing_id = owned_printing_quantity.printing_id;
$$;

create function private.checked_deck_ids(field text, value jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  perform private.checked_uuid_list(field, value, 10);
  perform private.invalid_argument(format('%s[0]', field), format('%s[0] is not one of your decks.', field));
  return value;
end;
$$;

create function private.check_search_query(query jsonb, api public.search_api)
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
      when field = 'price_currency' then
        private.checked_choice(field, value, enum_range(null::public.price_currency)::text[])
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
      when api = 'collection' and field in ('is_free', 'is_protected') then
        private.checked_boolean(field, value)
      when field = 'sort' then
        private.checked_choice(
          field,
          value,
          array['relevance', 'name', 'mana_value', 'edhrec_rank', 'price', 'release_date']
        )
      when field = 'sort_order' then
        private.checked_choice(field, value, array['asc', 'desc'])
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

  foreach bound in array array['mana_value', 'power', 'toughness', 'price'] loop
    if (checked ->> (bound || '_min'))::numeric > (checked ->> (bound || '_max'))::numeric then
      perform private.invalid_argument(
        bound || '_max',
        format('%s_max must not be less than %s_min.', bound, bound)
      );
    end if;
  end loop;

  checked := jsonb_build_object(
    'sort', case when checked ? 'text' then 'relevance' else 'name' end,
    'limit', 20,
    'price_currency', 'USD'
  ) || checked;
  if checked ->> 'sort' = 'relevance' and not checked ? 'text' then
    perform private.invalid_argument('sort', 'sort can be relevance only when text is set.');
  end if;

  return jsonb_build_object(
    'sort_order', case when checked ->> 'sort' = 'relevance' then 'desc' else 'asc' end
  ) || checked;
end;
$$;

create function private.price_condition(price_cents text, checked jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select format(
    '%s::numeric between %L and %L',
    price_cents,
    coalesce(round((checked ->> 'price_min')::numeric * 100), 0),
    coalesce(round((checked ->> 'price_max')::numeric * 100), 'Infinity')
  );
$$;

create function private.card_filter_conditions(checked jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  conditions text[] := '{}';
  value text;
  mask smallint;
  stat text;
begin
  for value in select jsonb_array_elements_text(checked -> 'names') loop
    conditions := conditions || format('c.name_key like %L', '%' || private.name_key(value) || '%');
  end loop;
  for value in select jsonb_array_elements_text(checked -> 'names_exclude') loop
    conditions := conditions || format('c.name_key not like %L', '%' || private.name_key(value) || '%');
  end loop;
  for value in select jsonb_array_elements_text(checked -> 'types') loop
    conditions := conditions || private.type_line_condition(value);
  end loop;
  for value in select jsonb_array_elements_text(checked -> 'types_exclude') loop
    conditions := conditions || ('not ' || private.type_line_condition(value));
  end loop;

  if checked ? 'colors' then
    mask := private.color_bits(array(select jsonb_array_elements_text(checked -> 'colors')));
    if checked -> 'colors' ? 'C' then
      conditions := conditions || 'c.color_bits = 0'::text;
    end if;
    if mask > 0 then
      conditions := conditions || format('c.color_bits & %s = %s', mask, mask);
    end if;
  end if;
  if checked ? 'colors_exclude' then
    mask := private.color_bits(array(select jsonb_array_elements_text(checked -> 'colors_exclude')));
    if checked -> 'colors_exclude' ? 'C' then
      conditions := conditions || 'c.color_bits <> 0'::text;
    end if;
    if mask > 0 then
      conditions := conditions || format('c.color_bits & %s = 0', mask);
    end if;
  end if;
  if checked ? 'identity_subset_of' then
    mask := private.color_bits(array(select jsonb_array_elements_text(checked -> 'identity_subset_of')));
    conditions := conditions || format('c.identity_bits & %s = 0', 31 # mask);
  end if;

  if checked ? 'mana_value_min' then
    conditions := conditions || format('c.mana_value >= %s', (checked ->> 'mana_value_min')::integer);
  end if;
  if checked ? 'mana_value_max' then
    conditions := conditions || format('c.mana_value <= %s', (checked ->> 'mana_value_max')::integer);
  end if;
  foreach stat in array array['power', 'toughness'] loop
    if checked ? (stat || '_min') or checked ? (stat || '_max') then
      conditions := conditions || format(
        'exists (select 1 from public.card_faces f where f.oracle_id = c.oracle_id '
        'and case when f.%1$I ~ ''^-?[0-9]+(\.[0-9]+)?$'' then f.%1$I::numeric end between %2$L and %3$L)',
        stat,
        coalesce(checked ->> (stat || '_min'), '-Infinity'),
        coalesce(checked ->> (stat || '_max'), 'Infinity')
      );
    end if;
  end loop;

  if checked ? 'keywords' then
    conditions := conditions || format(
      'private.keyword_keys(c.keywords) @> %L::text[]',
      array(select jsonb_array_elements_text(checked -> 'keywords'))
    );
  end if;
  if checked ? 'keywords_exclude' then
    conditions := conditions || format(
      'not private.keyword_keys(c.keywords) && %L::text[]',
      array(select jsonb_array_elements_text(checked -> 'keywords_exclude'))
    );
  end if;

  for value in select jsonb_array_elements_text(checked -> 'tags') loop
    conditions := conditions || private.tagged_cards_condition(
      format('select t.id from public.oracle_tags t where t.slug = %L', value)
    );
  end loop;
  if checked ? 'tags_exclude' then
    conditions := conditions || ('not ' || private.tagged_cards_condition(
      format(
        'select t.id from public.oracle_tags t where t.slug = any (%L::text[])',
        array(select jsonb_array_elements_text(checked -> 'tags_exclude'))
      )
    ));
  end if;

  if checked ? 'is_commander' then
    conditions := conditions || format('c.can_be_commander = %L', (checked ->> 'is_commander')::boolean);
  end if;
  if checked ? 'is_game_changer' then
    conditions := conditions || case when (checked ->> 'is_game_changer')::boolean
      then 'c.is_game_changer is true'
      else 'c.is_game_changer is not true'
    end;
  end if;

  return conditions;
end;
$$;

create or replace function private.catalog_filter_conditions(checked jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  conditions text[] := array['c.commander_legality = ''legal''', 'c.absent_since is null']
    || private.card_filter_conditions(checked);
  present_printing constant text :=
    'exists (select 1 from public.card_printings p where p.oracle_id = c.oracle_id and p.absent_since is null and %s)';
  value text;
begin
  for value in select jsonb_array_elements_text(checked -> 'sets') loop
    conditions := conditions || format(present_printing, format('p.set_code = %L', value));
  end loop;
  if checked ? 'sets_exclude' then
    conditions := conditions || format(
      'not ' || present_printing,
      format('p.set_code = any (%L::text[])', array(select jsonb_array_elements_text(checked -> 'sets_exclude')))
    );
  end if;
  for value in select jsonb_array_elements_text(checked -> 'rarities') loop
    conditions := conditions || format(present_printing, format('p.rarity = %L', value));
  end loop;
  if checked ? 'rarities_exclude' then
    conditions := conditions || format(
      'not ' || present_printing,
      format(
        'p.rarity = any (%L::public.card_rarity[])',
        array(select jsonb_array_elements_text(checked -> 'rarities_exclude'))
      )
    );
  end if;

  if checked ? 'price_min' or checked ? 'price_max' then
    conditions := conditions || format(
      'exists (select 1 from public.card_lowest_prices lp where lp.oracle_id = c.oracle_id and lp.currency = %L and %s)',
      checked ->> 'price_currency',
      private.price_condition('lp.amount_cents', checked)
    );
  end if;

  return conditions;
end;
$$;

create function private.collection_filter_conditions(checked jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  conditions text[] := private.card_filter_conditions(checked);
  entry_chip text[];
  value text;
begin
  for value in select jsonb_array_elements_text(checked -> 'sets') loop
    conditions := conditions || format('p.set_code = %L', value);
  end loop;
  if checked ? 'sets_exclude' then
    conditions := conditions || format(
      'p.set_code <> all (%L::text[])',
      array(select jsonb_array_elements_text(checked -> 'sets_exclude'))
    );
  end if;
  for value in select jsonb_array_elements_text(checked -> 'rarities') loop
    conditions := conditions || format('p.rarity = %L', value);
  end loop;
  if checked ? 'rarities_exclude' then
    conditions := conditions || format(
      'p.rarity <> all (%L::public.card_rarity[])',
      array(select jsonb_array_elements_text(checked -> 'rarities_exclude'))
    );
  end if;

  foreach entry_chip slice 1 in array array[
    ['finishes', 'finish'],
    ['conditions', 'condition'],
    ['languages', 'language']
  ] loop
    for value in select jsonb_array_elements_text(checked -> entry_chip[1]) loop
      conditions := conditions || format('a.%I = %L', entry_chip[2], value);
    end loop;
    if checked ? (entry_chip[1] || '_exclude') then
      conditions := conditions || format(
        'a.%I::text <> all (%L::text[])',
        entry_chip[2],
        array(select jsonb_array_elements_text(checked -> (entry_chip[1] || '_exclude')))
      );
    end if;
  end loop;

  if checked ? 'price_min' or checked ? 'price_max' then
    conditions := conditions || private.price_condition(
      format('private.finish_price_cents(price, a.finish, %L)', checked ->> 'price_currency'),
      checked
    );
  end if;

  if checked ? 'is_free' then
    conditions := conditions || case when (checked ->> 'is_free')::boolean
      then 'a.free_quantity > 0'
      else 'a.free_quantity = 0'
    end;
  end if;
  if checked ? 'is_protected' then
    conditions := conditions || format('a.is_protected = %L', (checked ->> 'is_protected')::boolean);
  end if;

  return conditions;
end;
$$;

create function private.text_search(checked jsonb, out condition text, out tier text, out text_rank text)
language plpgsql
stable
set search_path = ''
as $$
declare
  text_key text;
  text_query text;
  name_match text;
  tag_match text;
begin
  tier := '0';
  text_rank := '0';
  if not checked ? 'text' then
    return;
  end if;
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
    condition := format(
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
    condition := format('c.name_key like %L', '%' || text_key || '%');
    tier := name_match || 'end';
  end if;
end;
$$;

create function private.run_search(api public.search_api, query jsonb)
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
  currency text;
  query_hash text;
  page_size integer;
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

  checked := private.check_search_query(coalesce(query, '{}'), api);
  if api = 'catalog' and not exists (
    select 1
    from jsonb_object_keys(checked) as field
    where field not in ('sort', 'sort_order', 'limit', 'include_oracle_text', 'cursor', 'price_currency')
  ) then
    perform private.raise_search_error(
      'invalid_argument',
      'Catalog search needs text or at least one filter.'
    );
  end if;

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

  descending := checked ->> 'sort_order' = 'desc';
  sign := case when descending then '-' else '' end;
  sort_columns := case checked ->> 'sort'
    when 'relevance' then format('false, %s, %s', matched_text.tier, matched_text.text_rank)
    when 'name' then 'false, 0, 0'
    when 'mana_value' then format('false, %sc.mana_value, 0', sign)
    when 'edhrec_rank' then format('c.edhrec_rank is null, coalesce(%sc.edhrec_rank, 0), 0', sign)
    when 'release_date' then format('false, %s(%s - date ''1970-01-01''), 0', sign, released_at)
    when 'price' then format('%1$s is null, coalesce(%2$s%1$s, 0), 0', price_cents, sign)
  end;
  direction := case
    when checked ->> 'sort' = 'relevance' and not descending then 'desc'
    when checked ->> 'sort' = 'name' and descending then 'desc'
    else 'asc'
  end;

  execute format(
    $sql$
      with matches as (
        select %6$s as row_id, c.name_key, keys.sort_flag, keys.sort_primary, keys.sort_secondary
        from %7$s
        cross join lateral (select %1$s) as keys(sort_flag, sort_primary, sort_secondary)
        where %2$s
      ),
      page as (
        select m.*, count(*) over () as total_count
        from matches m
        where $1 is null
          or (m.sort_flag, m.sort_primary, m.sort_secondary, m.name_key, m.row_id) %3$s (
            ($1 ->> 0)::boolean, ($1 ->> 1)::numeric, ($1 ->> 2)::numeric, $1 ->> 3, ($1 ->> 4)::uuid
          )
        order by %4$s
        limit %5$s
      )
      select
        coalesce(jsonb_agg(
          jsonb_build_array(p.sort_flag, p.sort_primary, p.sort_secondary, p.name_key, p.row_id)
          order by %4$s
        ), '[]'::jsonb),
        coalesce(max(p.total_count), 0)
      from page p
    $sql$,
    sort_columns,
    array_to_string(array['true'] || conditions, ' and '),
    case direction when 'asc' then '>' else '<' end,
    format(
      'sort_flag %1$s, sort_primary %1$s, sort_secondary %1$s, name_key %1$s, row_id %1$s',
      direction
    ),
    case when after_key is null then greatest(page_size, telemetry_ids) else page_size end + 1,
    case api when 'catalog' then 'c.oracle_id' else 'a.collection_entry_id' end,
    case api
      when 'catalog' then 'public.cards c'
      else 'private.collection_availability a '
        'join public.card_printings p on p.id = a.card_printing_id '
        'join public.cards c on c.oracle_id = p.oracle_id '
        'left join public.card_prices price on price.printing_id = p.id'
    end
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
    case api
      when 'catalog' then jsonb_build_object(
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
      else jsonb_build_object(
        'collection_entry_id', a.collection_entry_id,
        'oracle_id', c.oracle_id,
        'printing_id', p.id,
        'name', c.name,
        'set', p.set_code,
        'collector_number', p.collector_number,
        'finish', a.finish,
        'language', a.language,
        'condition', a.condition,
        'protected', a.is_protected,
        'quantity', a.quantity,
        'free_quantity', a.free_quantity,
        'allocated_quantity', a.allocated_quantity,
        'held_quantity', a.held_quantity,
        'commander_legal', c.commander_legality = 'legal'
      )
    end || case
      when (checked ->> 'include_oracle_text')::boolean then jsonb_build_object('oracle_text', c.oracle_text)
      else '{}'::jsonb
    end
    order by page.ordinality
  ), '[]'::jsonb)
  into items
  from unnest(page_ids) with ordinality as page(row_id, ordinality)
  left join private.collection_availability a on api = 'collection' and a.collection_entry_id = page.row_id
  left join public.card_printings p on p.id = a.card_printing_id
  join public.cards c on c.oracle_id = case api when 'catalog' then page.row_id else p.oracle_id end;

  if after_key is null then
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

create or replace function public.search_catalog(query jsonb)
returns jsonb
language sql
volatile
security definer
set search_path = ''
as $$
  select private.run_search('catalog', query);
$$;

create function public.search_collection(query jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  return private.run_search('collection', query);
end;
$$;

revoke all on function public.search_collection(jsonb) from public, anon, service_role;
grant execute on function public.search_collection(jsonb) to authenticated;

create or replace function private.card_details_row(card public.cards, printing public.card_printings)
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
    'price_from', private.price_from(card.oracle_id, 'USD'),
    'owned', private.owned_copies(card.oracle_id),
    'tags', (
      select coalesce(jsonb_agg(
        jsonb_build_object('slug', t.slug, 'label', t.label)
        order by t.label collate "C", t.slug
      ), '[]'::jsonb)
      from public.card_taggings ct
      join public.oracle_tags t on t.id = ct.tag_id
      where ct.oracle_id = card.oracle_id
        and not exists (select 1 from public.disabled_tags d where d.tag_id = t.id)
    ),
    'combos', (
      select coalesce(jsonb_agg(combo.details order by combo.position), '[]'::jsonb)
      from (
        select
          jsonb_build_object(
            'spellbook_id', c.id,
            'other_card', jsonb_build_object('oracle_id', other.oracle_id, 'name', other.name),
            'produced_features', to_jsonb(c.produced_features),
            'bracket_tag', c.bracket_tag
          ) as details,
          row_number() over (
            order by other.edhrec_rank nulls last, other.name collate "C", c.id collate "C"
          ) as position
        from public.combos c
        join public.cards other on other.oracle_id = case
          when c.first_oracle_id = card.oracle_id then c.second_oracle_id
          else c.first_oracle_id
        end
        where card.oracle_id in (c.first_oracle_id, c.second_oracle_id)
        order by position
        limit 5
      ) combo
    )
  ) || case
    when printing.id is null then '{}'::jsonb
    else jsonb_build_object('printing', private.card_printing_fields(printing))
  end;
$$;

create or replace function public.list_card_printings(query jsonb)
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
  data_as_of := private.rules_freshness();
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
      and (p.absent_since is null or private.owned_printing_quantity(p.id) > 0)
      and (not (checked ->> 'owned_only')::boolean or private.owned_printing_quantity(p.id) > 0)
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
    private.card_printing_fields(page_rows[i])
      || jsonb_build_object(
        'image_uris', to_jsonb(page_rows[i].image_uris),
        'owned_quantity', private.owned_printing_quantity(page_rows[i].id)
      )
    order by i
  ), '[]'::jsonb)
  into items
  from generate_series(1, least(cardinality(page_rows), page_size)) as i;

  return jsonb_build_object('items', items, 'next_cursor', next_cursor) || data_as_of;
end;
$$;

create or replace function public.add_scan_batch(batch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid;
  checked jsonb;
  addition public.collection_additions;
begin
  caller := private.caller_user_id();
  checked := private.check_scan_batch(batch);

  insert into public.collection_additions (user_id, added_at, copy_count, source, idempotency_key)
    values (
      caller,
      now(),
      (select sum((stack ->> 'quantity')::integer) from jsonb_array_elements(checked -> 'items') as stack),
      'scan_batch',
      (checked ->> 'idempotency_key')::uuid
    )
    on conflict on constraint collection_additions_idempotency_key do nothing
    returning * into addition;

  if addition.id is null then
    select * into addition
      from public.collection_additions a
      where a.user_id = caller and a.idempotency_key = (checked ->> 'idempotency_key')::uuid;
    if private.scan_batch_stacks(addition.id) is distinct from checked -> 'items' then
      perform private.raise_search_error(
        'idempotency_conflict',
        'idempotency_key was already used for a scan batch with different items.',
        'idempotency_key'
      );
    end if;
    return private.scan_batch_result(addition, true);
  end if;

  with stacks as (
    select s.* from jsonb_populate_recordset(null::private.scan_batch_stack, checked -> 'items') as s
  ),
  merged as (
    insert into public.collection_entries as entry (
      user_id, card_printing_id, finish, condition, language, quantity, latest_addition_at
    )
    select caller, s.card_printing_id, s.finish, s.condition, s.language, s.quantity, addition.added_at
    from stacks s
    order by s.card_printing_id, s.finish, s.condition, s.language
    on conflict on constraint collection_entries_identity do update set
      quantity = entry.quantity + excluded.quantity,
      latest_addition_at = greatest(entry.latest_addition_at, excluded.latest_addition_at)
    returning entry.id, entry.card_printing_id, entry.finish, entry.condition, entry.language, entry.quantity
  ),
  price_snapshot as (
    select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'prices'
  )
  insert into public.collection_addition_lines (
    addition_id, user_id, card_printing_id, finish, condition, language, quantity,
    collection_entry_id, entry_quantity, purchase_day_usd_cents, purchase_day_eur_cents, price_snapshot_at
  )
  select
    addition.id,
    caller,
    s.card_printing_id,
    s.finish,
    s.condition,
    s.language,
    s.quantity,
    merged.id,
    merged.quantity,
    private.finish_price_cents(price, s.finish, 'USD'),
    private.finish_price_cents(price, s.finish, 'EUR'),
    (select price_snapshot.snapshot_at from price_snapshot)
  from stacks s
  join merged using (card_printing_id, finish, condition, language)
  left join public.card_prices price on price.printing_id = s.card_printing_id;

  return private.scan_batch_result(addition, false);
end;
$$;

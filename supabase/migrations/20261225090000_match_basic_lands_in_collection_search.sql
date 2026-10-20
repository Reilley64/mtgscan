create function private.copy_filter_conditions(checked jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  conditions text[] := '{}';
  user_tags_of_copy constant text :=
    'select 1 from public.copy_user_tags link '
    'join public.user_tags user_tag on user_tag.user_id = link.user_id and user_tag.id = link.user_tag_id '
    'where link.user_id = a.user_id and link.copy_id = a.copy_id '
    'and link.deleted_at is null and user_tag.deleted_at is null';
  deck_of_copy constant text :=
    'select 1 from public.deck_cards deck_card '
    'where deck_card.user_id = a.user_id and deck_card.copy_id = a.copy_id';
  entry_chip text[];
  value text;
begin
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
      'private.finish_price_cents(price, a.finish)',
      checked
    );
  end if;

  if checked ? 'is_free' then
    conditions := conditions || case when (checked ->> 'is_free')::boolean
      then 'a.is_free'
      else 'not a.is_free'
    end;
  end if;
  if checked ? 'is_protected' then
    conditions := conditions || format('a.is_protected = %L', (checked ->> 'is_protected')::boolean);
  end if;
  if checked ? 'is_allocated' then
    conditions := conditions || format('a.is_allocated = %L', (checked ->> 'is_allocated')::boolean);
  end if;
  if checked ? 'deck_ids' then
    conditions := conditions || format(
      'exists (%s and deck_card.deck_id = any (%L::uuid[]))',
      deck_of_copy,
      array(select jsonb_array_elements_text(checked -> 'deck_ids'))
    );
  end if;
  if checked ? 'deck_ids_exclude' then
    conditions := conditions || format(
      'not exists (%s and deck_card.deck_id = any (%L::uuid[]))',
      deck_of_copy,
      array(select jsonb_array_elements_text(checked -> 'deck_ids_exclude'))
    );
  end if;

  for value in select jsonb_array_elements_text(checked -> 'user_tags') loop
    conditions := conditions || format('exists (%s and lower(user_tag.name) = %L)', user_tags_of_copy, value);
  end loop;
  if checked ? 'user_tags_exclude' then
    conditions := conditions || format(
      'not exists (%s and lower(user_tag.name) = any (%L::text[]))',
      user_tags_of_copy,
      array(select jsonb_array_elements_text(checked -> 'user_tags_exclude'))
    );
  end if;

  return conditions;
end;
$$;

grant execute on function private.copy_filter_conditions(jsonb) to authenticated;

create or replace function private.collection_filter_conditions(checked jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
begin
  return private.card_filter_conditions(checked)
    || private.printing_filter_conditions(checked, '(%s)')
    || private.copy_filter_conditions(checked);
end;
$$;

create function private.matching_basic_lands(checked jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  conditions text[] := private.card_filter_conditions(checked);
  matched_text record;
  lands jsonb;
begin
  if cardinality(private.printing_filter_conditions(checked, '(%s)')) > 0
    or cardinality(private.copy_filter_conditions(checked)) > 0 then
    return '[]';
  end if;

  select * into matched_text from private.text_search(checked);
  if matched_text.condition is not null then
    conditions := conditions || matched_text.condition;
  end if;

  execute format(
    'select coalesce(jsonb_agg('
    'jsonb_build_object(''oracle_id'', land.oracle_id, ''name'', land.name, ''image_uris'', coalesce(to_jsonb(land.image_uris), ''[]''::jsonb)) '
    'order by land.kind_order'
    '), ''[]''::jsonb) '
    'from private.basic_land_cards() land '
    'join public.cards c on c.oracle_id = land.oracle_id '
    'where %s',
    array_to_string(array['true'] || conditions, ' and ')
  )
  into lands;
  return lands;
end;
$$;

grant execute on function private.matching_basic_lands(jsonb) to authenticated;

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
  basic_lands jsonb;
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
    where field not in ('rows', 'sort', 'sort_order', 'limit', 'include_oracle_text', 'cursor')
  );
  if api = 'catalog' and not searched then
    perform private.raise_search_error(
      'invalid_argument',
      'Catalog search needs text or at least one filter.'
    );
  end if;

  row_kind := checked ->> 'rows';
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
    price_cents := '(select lp.usd_cents from public.card_lowest_prices lp where lp.oracle_id = c.oracle_id)';
    released_at := 'c.released_at';
  else
    conditions := private.collection_filter_conditions(checked);
    price_cents := 'private.finish_price_cents(price, a.finish)';
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
    when 'added' then format('false, %sextract(epoch from a.created_at), 0', sign)
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
      'join public.card_printings p on p.id = a.card_printing_id '
      'join public.cards c on c.oracle_id = p.oracle_id '
      'left join public.card_prices price on price.printing_id = p.id '
      'where %s',
      case row_kind
        when 'copies' then
          'a.copy_id as row_id, a.card_printing_id, a.finish, null::jsonb as quantities, '
          'copy.created_at'
        else
          'min(a.copy_id::text)::uuid as row_id, a.card_printing_id, a.finish, '
          'jsonb_build_object('
          '''quantity'', count(*), '
          '''free_quantity'', count(*) filter (where a.is_free), '
          '''allocated_quantity'', count(*) filter (where a.is_allocated), '
          '''held_quantity'', count(*) filter (where a.is_held)'
          ') as quantities, '
          'max(copy.created_at) as created_at'
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
        'price_from', private.price_from(c.oracle_id),
        'owned', private.owned_copies(c.oracle_id)
      )
      when row_kind = 'copies' then
        private.copy_row(a, p, c, price, prices_freshness.is_stale) || jsonb_build_object(
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
          'created_at', (
            select copy.created_at
            from public.copies copy
            where copy.user_id = a.user_id and copy.id = a.copy_id
          )
        )
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
      ) || entry.quantities || private.collection_entry_price_and_total(price, a.finish, (entry.quantities ->> 'quantity')::integer, prices_freshness.is_stale)
    end || case
      when (checked ->> 'include_oracle_text')::boolean then jsonb_build_object('oracle_text', c.oracle_text)
      else '{}'::jsonb
    end
    order by page.ordinality
  ), '[]'::jsonb)
  into items
  from unnest(page_ids) with ordinality as page(row_id, ordinality)
  cross join lateral (select page_quantities -> (page.ordinality::integer - 1)) as entry(quantities)
  left join private.collection_availability a on api = 'collection' and a.copy_id = page.row_id
  left join public.card_printings p on p.id = a.card_printing_id
  join public.cards c on c.oracle_id = case api when 'catalog' then page.row_id else p.oracle_id end
  left join public.card_prices price on price.printing_id = p.id;

  if api = 'collection' and after_key is null then
    basic_lands := case when searched or total_count > 0 then private.matching_basic_lands(checked) else '[]' end;
  end if;

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
  ) || case
    when api = 'collection' then jsonb_build_object(
      'total_count', case when after_key is null then total_count end,
      'basic_lands', basic_lands
    )
    else '{}'::jsonb
  end;
end;
$$;

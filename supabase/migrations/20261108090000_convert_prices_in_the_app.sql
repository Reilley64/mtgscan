drop function public.list_price_currencies();
drop function private.copy_row(
  private.collection_availability,
  public.card_printings,
  public.cards,
  public.card_prices,
  public.exchange_rates,
  boolean
);
drop function private.collection_entry_price_and_total(
  public.card_prices,
  public.card_finish,
  integer,
  public.exchange_rates,
  boolean
);
drop function private.current_price(public.card_prices, public.card_finish, public.exchange_rates, boolean);
drop function private.price_json(integer, public.exchange_rates, public.card_finish);
drop function private.price_from(uuid, text);
drop function private.card_details_row(public.cards, public.card_printings, text);
drop function private.checked_price_currency(text, jsonb);
drop function private.converted_amount(bigint, public.exchange_rates);
drop function private.exchange_rate_fields(public.exchange_rates);
drop function private.exchange_rate_is_stale(public.exchange_rates);
drop function private.exchange_rate(text);

create function private.usd_amount(usd_cents bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select round(usd_cents / 100.0, 2)::text;
$$;

create function private.price_json(usd_cents integer, finish public.card_finish)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when usd_cents is not null then jsonb_build_object(
    'amount', private.usd_amount(usd_cents),
    'currency', 'USD',
    'finish', finish
  ) end;
$$;

create function private.current_price(price public.card_prices, finish public.card_finish, prices_stale boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select private.price_json(private.finish_price_cents(price, finish), finish)
    || jsonb_build_object('stale', prices_stale);
$$;

create function private.collection_entry_price_and_total(
  price public.card_prices,
  finish public.card_finish,
  quantity integer,
  prices_stale boolean
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'price', private.current_price(price, finish, prices_stale),
    'total', private.usd_amount(private.finish_price_cents(price, finish)::bigint * quantity)
  );
$$;

create function private.copy_row(
  a private.collection_availability,
  p public.card_printings,
  c public.cards,
  price public.card_prices,
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
    'price', private.current_price(price, a.finish, prices_stale)
  );
$$;

create function private.price_from(oracle_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.price_json(lowest.usd_cents, lowest.finish)
    || jsonb_build_object('basis', 'lowest current price over printings and finishes')
  from public.card_lowest_prices lowest
  where lowest.oracle_id = price_from.oracle_id;
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
    'price_from', private.price_from(card.oracle_id),
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

create or replace function private.price_condition(price_cents text, checked jsonb)
returns text
language sql
stable
set search_path = ''
as $$
  select format(
    '%1$s::numeric >= %2$L and %1$s::numeric <= %3$L',
    price_cents,
    coalesce((checked ->> 'price_min')::numeric * 100, 0),
    coalesce((checked ->> 'price_max')::numeric * 100, 'Infinity')
  );
$$;

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
      when api = 'collection' and field in ('is_free', 'is_protected') then
        private.checked_boolean(field, value)
      when api = 'collection' and field in ('user_tags', 'user_tags_exclude') then
        private.checked_user_tag_names(field, value)
      when api = 'collection' and field = 'rows' then
        private.checked_choice(field, value, array['entries', 'copies'])
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
        private.checked_integer(field, value, 1, case when query ->> 'rows' = 'copies' then 120 else 50 end)
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
    'limit', case when checked ->> 'rows' = 'copies' then 60 else 20 end
  ) || case when api = 'collection' then jsonb_build_object('rows', 'entries') else '{}' end || checked;
  if api = 'catalog' and checked ->> 'sort' = 'relevance' and not checked ? 'text' then
    perform private.invalid_argument('sort', 'sort can be relevance only when text is set.');
  end if;

  return jsonb_build_object(
    'sort_order', case when checked ->> 'sort' in ('relevance', 'added') then 'desc' else 'asc' end
  ) || checked;
end;
$$;

create or replace function private.check_copy_query(query jsonb)
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
    end;
    if checked_value is null then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'copy_id' then
    perform private.invalid_argument('copy_id', 'copy_id is required.');
  end if;
  return checked;
end;
$$;

create or replace function private.check_collection_total_query(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  field text;
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  select min(entry.key) into field from jsonb_object_keys(query) as entry(key);
  if field is not null then
    perform private.invalid_argument(field, format('%s is not a known field.', field));
  end if;
  return check_collection_total_query.query;
end;
$$;

create or replace function private.check_card_details_query(query jsonb)
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
      when field in ('oracle_ids', 'printing_ids') then
        private.checked_uuid_list(field, value, 20)
    end;
    if checked_value is null then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if checked ? 'oracle_ids' and checked ? 'printing_ids' then
    perform private.invalid_argument('printing_ids', 'printing_ids cannot be used together with oracle_ids.');
  end if;
  if not (checked ? 'oracle_ids' or checked ? 'printing_ids') then
    perform private.invalid_argument('oracle_ids', 'Give oracle_ids or printing_ids.');
  end if;
  return checked;
end;
$$;

create or replace function private.check_current_prices_query(query jsonb)
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
      when field = 'items' then
        (
          select jsonb_agg(private.checked_current_price_item(format('items[%s]', e.ordinality - 1), e.element) order by e.ordinality)
          from jsonb_array_elements(private.checked_list(field, value, 1, 100)) with ordinality as e(element, ordinality)
        )
    end;
    if checked_value is null then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'items' then
    perform private.invalid_argument('items', 'items is required.');
  end if;
  return checked;
end;
$$;

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
        'price_from', private.price_from(c.oracle_id),
        'owned', private.owned_copies(c.oracle_id)
      )
      when row_kind = 'copies' then
        private.copy_row(a, p, c, price, prices_freshness.is_stale)
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
    when api = 'collection' then jsonb_build_object('total_count', case when after_key is null then total_count end)
    else '{}'::jsonb
  end;
end;
$$;

create or replace function public.get_copy(query jsonb)
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
  checked := private.check_copy_query(query);
  select f.is_stale into prices_stale
    from public.catalog_freshness() f
    where f.source = 'prices';

  select private.copy_row(a, p, c, price, prices_stale) || jsonb_build_object(
    'free', a.is_free,
    'added_at', addition.added_at,
    'purchase_day_price', private.price_json(line.purchase_day_usd_cents, a.finish),
    'type_line', c.type_line,
    'faces', coalesce((
      select jsonb_agg(jsonb_build_object('name', f.name, 'oracle_text', f.oracle_text) order by f.face_index)
      from public.card_faces f
      where f.oracle_id = c.oracle_id
    ), '[]'::jsonb),
    'commander_legality', c.commander_legality,
    'art_crop_uri', p.art_crop_uri,
    'user_tags', coalesce((
      select jsonb_agg(jsonb_build_object('user_tag_id', user_tag.id, 'name', user_tag.name) order by lower(user_tag.name), user_tag.name, user_tag.id)
      from public.copy_user_tags link
      join public.user_tags user_tag on user_tag.user_id = link.user_id and user_tag.id = link.user_tag_id
      where link.user_id = a.user_id and link.copy_id = a.copy_id
    ), '[]'::jsonb)
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

create or replace function public.get_collection_total(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  prices_freshness record;
  current_total private.collection_totals;
begin
  perform private.caller_user_id();
  perform private.check_collection_total_query(query);

  select * into prices_freshness from public.catalog_freshness() f where f.source = 'prices';
  select * into current_total from private.collection_totals;

  return jsonb_build_object(
    'total', private.usd_amount(coalesce(current_total.total_cents, 0)),
    'currency', 'USD',
    'priced_copies', coalesce(current_total.priced_copies, 0),
    'copies', coalesce(current_total.copies, 0),
    'stale', prices_freshness.is_stale,
    'prices_observed_at', prices_freshness.snapshot_at
  );
end;
$$;

create or replace function public.get_cards(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  data_as_of jsonb;
  prices_as_of jsonb;
  checked jsonb;
  by_printing boolean;
  id_field text;
  items jsonb;
  not_found jsonb;
begin
  data_as_of := private.rules_freshness();
  checked := private.check_card_details_query(query);
  select jsonb_build_object(
    'prices_observed_at', f.snapshot_at,
    'prices_stale', f.is_stale
  )
    into prices_as_of
    from public.catalog_freshness() f
    where f.source = 'prices';
  by_printing := checked ? 'printing_ids';
  id_field := case when by_printing then 'printing_ids' else 'oracle_ids' end;

  select
    coalesce(jsonb_agg(private.card_details_row(c, p) order by r.ordinality) filter (where c.oracle_id is not null), '[]'::jsonb),
    coalesce(jsonb_agg(given.id order by r.ordinality) filter (where c.oracle_id is null), '[]'::jsonb)
  into items, not_found
  from jsonb_array_elements_text(checked -> id_field) with ordinality as r(id, ordinality)
  join jsonb_array_elements_text(query -> id_field) with ordinality as given(id, ordinality)
    on given.ordinality = r.ordinality
  left join public.card_printings p on by_printing and p.id = r.id::uuid
  left join public.cards c on c.oracle_id = case when by_printing then p.oracle_id else r.id::uuid end;

  return jsonb_build_object('items', items, 'not_found', not_found) || data_as_of || prices_as_of;
end;
$$;

create or replace function public.get_current_prices(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  prices_stale boolean;
  items jsonb;
begin
  checked := private.check_current_prices_query(query);
  select f.is_stale into prices_stale
    from public.catalog_freshness() f
    where f.source = 'prices';

  select jsonb_agg(
    jsonb_build_object(
      'printing_id', item.printing_id,
      'finish', item.finish,
      'price', private.current_price(price, item.finish, prices_stale)
    )
    order by item.ordinality
  )
  into items
  from (
    select (e.element ->> 'printing_id')::uuid as printing_id, (e.element ->> 'finish')::public.card_finish as finish, e.ordinality
    from jsonb_array_elements(checked -> 'items') with ordinality as e(element, ordinality)
  ) item
  left join public.card_prices price on price.printing_id = item.printing_id;

  return jsonb_build_object('items', items);
end;
$$;

grant execute on function
  private.usd_amount(bigint),
  private.price_json(integer, public.card_finish),
  private.current_price(public.card_prices, public.card_finish, boolean),
  private.collection_entry_price_and_total(public.card_prices, public.card_finish, integer, boolean),
  private.copy_row(
    private.collection_availability,
    public.card_printings,
    public.cards,
    public.card_prices,
    boolean
  ),
  private.price_from(uuid)
to authenticated, service_role;

grant execute on function private.card_details_row(public.cards, public.card_printings) to authenticated;

create function public.list_exchange_rates()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object('items', jsonb_agg(
    jsonb_build_object(
      'currency', offered.currency,
      'rate', offered.rate::text,
      'rate_date', offered.rate_date,
      'minor_unit_digits', private.minor_unit_digits(offered.currency)
    )
    order by offered.currency
  ))
  from (
    select 'USD' as currency, 1::numeric as rate, null::date as rate_date
    union all
    select r.currency, r.rate, r.rate_date from public.exchange_rates r where r.currency <> 'USD'
  ) offered;
$$;

revoke all on function public.list_exchange_rates() from public, anon, service_role;
grant execute on function public.list_exchange_rates() to authenticated;

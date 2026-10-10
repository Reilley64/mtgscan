create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

create function private.name_key(value text)
returns text
language sql
immutable
parallel safe
security definer
set search_path = ''
as $$
  select string_agg(
    regexp_replace(
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, face)),
      '[^[:alnum:]]+',
      '',
      'g'
    ),
    '/'
    order by face_index
  )
  from regexp_split_to_table(value, '\s*//\s*') with ordinality as faces(face, face_index);
$$;

revoke all on function private.name_key(text) from public;
grant execute on function private.name_key(text) to catalog_importer;

create function private.color_bits(colors text[])
returns smallint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select coalesce(sum(distinct case color
    when 'W' then 1
    when 'U' then 2
    when 'B' then 4
    when 'R' then 8
    when 'G' then 16
    else 0
  end), 0)::smallint
  from unnest(colors) as color;
$$;

create function private.keyword_keys(keywords text[])
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array(select lower(keyword) from unnest(keywords) as keyword);
$$;

create function private.type_words(type_line text)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $$
  select array_remove(regexp_split_to_array(lower(type_line), '[^[:alnum:]]+'), '');
$$;

create function private.some_face_has_type_words(type_line text, words text[])
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select exists (
    select 1 from unnest(string_to_array(type_line, ' // ')) as face where private.type_words(face) @> words
  );
$$;

create function private.type_line_condition(type_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select '('
    || string_agg(format('c.type_line ~* %L', '\m' || word || '\M'), ' and ')
    || case when count(*) > 1 then format(
      ' and (c.type_line not like ''%% // %%'' or private.some_face_has_type_words(c.type_line, %L))',
      private.type_words(type_value)
    ) else '' end
    || ')'
  from unnest(private.type_words(type_value)) as word;
$$;

create function private.card_search_vector(name text, type_line text, oracle_text text, keywords text[])
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select setweight(to_tsvector('english'::regconfig, name), 'A')
    || setweight(to_tsvector('english'::regconfig, type_line), 'C')
    || setweight(to_tsvector('english'::regconfig, oracle_text || ' ' || array_to_string(keywords, ' ')), 'D');
$$;

alter table public.cards
  add column name_key text collate "C" generated always as (private.name_key(name)) stored,
  add column color_bits smallint generated always as (private.color_bits(colors)) stored,
  add column identity_bits smallint generated always as (private.color_bits(color_identity)) stored,
  add column search_vector tsvector
    generated always as (private.card_search_vector(name, type_line, oracle_text, keywords)) stored;

create index cards_search_vector on public.cards using gin (search_vector);
create index cards_name_key_trigrams on public.cards using gin (name_key extensions.gin_trgm_ops);
create index cards_keyword_keys on public.cards using gin (private.keyword_keys(keywords));
create index cards_name_key on public.cards (name_key, oracle_id);
create index cards_mana_value on public.cards (mana_value);
create index cards_edhrec_rank on public.cards (edhrec_rank);
create index cards_released_at on public.cards (released_at);

create type public.search_api as enum ('catalog', 'collection');

create type public.search_caller as enum ('app', 'mcp', 'release_check');

create table public.search_telemetry (
  search_id uuid primary key,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  api public.search_api not null,
  caller public.search_caller not null,
  query jsonb not null,
  result_count integer not null,
  latency_ms double precision not null,
  result_ids uuid[] not null
);

create index search_telemetry_created_at on public.search_telemetry (created_at);

alter table public.search_telemetry enable row level security;

revoke all on table public.search_telemetry from anon, authenticated, service_role;
grant select on table public.search_telemetry to service_role;

create function private.raise_search_error(error_code text, error_message text, error_field text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise sqlstate 'PGRST' using
    message = jsonb_build_object(
      'code', error_code,
      'message', error_message,
      'details', error_field,
      'hint', null
    )::text,
    detail = jsonb_build_object(
      'status', case error_code when 'data_unavailable' then 503 else 400 end,
      'headers', '{}'::jsonb
    )::text;
end;
$$;

create function private.invalid_argument(field text, message text)
returns void
language sql
set search_path = ''
as $$
  select private.raise_search_error('invalid_argument', message, field);
$$;

create function private.checked_boolean(field text, value jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'boolean' then
    perform private.invalid_argument(field, format('%s must be true or false.', field));
  end if;
  return value;
end;
$$;

create function private.checked_integer(field text, value jsonb, minimum integer, maximum integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'number' then
    perform private.invalid_argument(field, format('%s must be a number.', field));
  end if;
  if value::numeric <> trunc(value::numeric) or value::numeric not between minimum and maximum then
    perform private.invalid_argument(
      field,
      format('%s must be a whole number from %s to %s.', field, minimum, maximum)
    );
  end if;
  return to_jsonb(value::integer);
end;
$$;

create function private.checked_number(field text, value jsonb, minimum integer, maximum integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'number' then
    perform private.invalid_argument(field, format('%s must be a number.', field));
  end if;
  if value::numeric not between minimum and maximum then
    perform private.invalid_argument(field, format('%s must be from %s to %s.', field, minimum, maximum));
  end if;
  return value;
end;
$$;

create function private.checked_choice(field text, value jsonb, choices text[])
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'string' or not (value #>> '{}' = any (choices)) then
    perform private.invalid_argument(
      field,
      format('%s must be one of: %s.', field, array_to_string(choices, ', '))
    );
  end if;
  return value;
end;
$$;

create function private.checked_text(field text, value jsonb, max_length integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'string' then
    perform private.invalid_argument(field, format('%s must be a string.', field));
  end if;
  if char_length(value #>> '{}') not between 1 and max_length then
    perform private.invalid_argument(
      field,
      format('%s must be a string of 1 to %s characters.', field, max_length)
    );
  end if;
  if (value #>> '{}') !~ '[[:alnum:]]' then
    perform private.invalid_argument(field, format('%s must contain a letter or a digit.', field));
  end if;
  return value;
end;
$$;

create function private.checked_list(field text, value jsonb, min_items integer, max_items integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  item jsonb;
  item_index bigint;
begin
  if jsonb_typeof(value) is distinct from 'array'
    or jsonb_array_length(value) not between min_items and max_items then
    perform private.invalid_argument(
      field,
      format('%s must be a list of %s to %s values.', field, min_items, max_items)
    );
  end if;
  for item, item_index in
    select element, ordinality - 1 from jsonb_array_elements(value) with ordinality as e(element, ordinality)
  loop
    if exists (
      select 1
      from jsonb_array_elements(value) with ordinality as earlier(element, ordinality)
      where earlier.element = item and earlier.ordinality - 1 < item_index
    ) then
      perform private.invalid_argument(
        format('%s[%s]', field, item_index),
        format('%s[%s] repeats another value in %s.', field, item_index, field)
      );
    end if;
  end loop;
  return value;
end;
$$;

create function private.checked_text_list(field text, value jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  item_index integer;
begin
  perform private.checked_list(field, value, 1, 10);
  for item_index in 0 .. jsonb_array_length(value) - 1 loop
    perform private.checked_text(format('%s[%s]', field, item_index), value -> item_index, 100);
  end loop;
  return value;
end;
$$;

create function private.checked_choice_list(field text, value jsonb, choices text[], min_items integer)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  item_index integer;
begin
  perform private.checked_list(field, value, min_items, cardinality(choices));
  for item_index in 0 .. jsonb_array_length(value) - 1 loop
    perform private.checked_choice(format('%s[%s]', field, item_index), value -> item_index, choices);
  end loop;
  return value;
end;
$$;

create function private.checked_catalog_values(field text, value jsonb, value_kind text)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  lowered jsonb;
  item_index bigint;
  item text;
  known boolean;
begin
  perform private.checked_text_list(field, value);
  lowered := (select jsonb_agg(lower(element)) from jsonb_array_elements_text(value) as element);
  perform private.checked_list(field, lowered, 1, 10);
  for item, item_index in
    select element, ordinality - 1 from jsonb_array_elements_text(lowered) with ordinality as e(element, ordinality)
  loop
    case value_kind
      when 'set' then
        known := exists (select 1 from public.card_printings p where p.set_code = item);
      when 'keyword' then
        known := exists (select 1 from public.cards c where private.keyword_keys(c.keywords) @> array[item]);
    end case;
    if not known then
      perform private.invalid_argument(
        format('%s[%s]', field, item_index),
        format('%s[%s] is not a known %s in the card catalog.', field, item_index, value_kind)
      );
    end if;
  end loop;
  return lowered;
end;
$$;

create function private.check_search_query(query jsonb)
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
      when field in ('rarities', 'rarities_exclude') then
        private.checked_choice_list(field, value, enum_range(null::public.card_rarity)::text[], 1)
      when field in ('is_commander', 'is_game_changer', 'include_oracle_text') then
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
      if field in ('tags', 'tags_exclude', 'price_min', 'price_max', 'price_currency') then
        perform private.invalid_argument(field, format('%s is not available yet.', field));
      elsif field = 'cursor' then
        perform private.invalid_argument(field, 'cursor must be a string or null.');
      else
        perform private.invalid_argument(field, format('%s is not a known field.', field));
      end if;
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  foreach bound in array array['mana_value', 'power', 'toughness'] loop
    if (checked ->> (bound || '_min'))::numeric > (checked ->> (bound || '_max'))::numeric then
      perform private.invalid_argument(
        bound || '_max',
        format('%s_max must not be less than %s_min.', bound, bound)
      );
    end if;
  end loop;

  checked := jsonb_build_object(
    'sort', case when checked ? 'text' then 'relevance' else 'name' end,
    'limit', 20
  ) || checked;
  if checked ->> 'sort' = 'price' then
    perform private.invalid_argument('sort', 'sort cannot be price until prices are imported.');
  end if;
  if checked ->> 'sort' = 'relevance' and not checked ? 'text' then
    perform private.invalid_argument('sort', 'sort can be relevance only when text is set.');
  end if;

  return jsonb_build_object(
    'sort_order', case when checked ->> 'sort' = 'relevance' then 'desc' else 'asc' end
  ) || checked;
end;
$$;

create function private.catalog_filter_conditions(checked jsonb)
returns text[]
language plpgsql
stable
set search_path = ''
as $$
declare
  conditions text[] := array['c.commander_legality = ''legal''', 'c.absent_since is null'];
  present_printing constant text :=
    'exists (select 1 from public.card_printings p where p.oracle_id = c.oracle_id and p.absent_since is null and %s)';
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

create function private.search_cursor(search_id uuid, query_hash text, last_key jsonb)
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(
    encode(
      convert_to(
        jsonb_build_object(
          'search_id', search_id,
          'query_hash', query_hash,
          'issued_at', extract(epoch from clock_timestamp()),
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

create function private.read_search_cursor(
  encoded_cursor text,
  query_hash text,
  out search_id uuid,
  out after_key jsonb
)
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
    search_id := (payload ->> 'search_id')::uuid;
    issued_at := (payload ->> 'issued_at')::double precision;
    after_key := payload -> 'after';
    if jsonb_typeof(after_key) is distinct from 'array'
      or jsonb_array_length(after_key) <> 5
      or num_nulls(
        search_id,
        issued_at,
        (after_key ->> 0)::boolean,
        (after_key ->> 1)::numeric,
        (after_key ->> 2)::numeric,
        after_key ->> 3,
        (after_key ->> 4)::uuid
      ) > 0 then
      payload := null;
    end if;
  exception when others then
    payload := null;
  end;

  if payload is null then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor is not valid. Start the search again.',
      'cursor'
    );
  end if;
  if payload ->> 'query_hash' is distinct from read_search_cursor.query_hash then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor belongs to another search. Start the search again.',
      'cursor'
    );
  end if;
  if issued_at < extract(epoch from now() - interval '15 minutes') then
    perform private.raise_search_error(
      'invalid_cursor',
      'The cursor has expired. Start the search again.',
      'cursor'
    );
  end if;
end;
$$;

create function private.record_search(
  search_id uuid,
  api public.search_api,
  query jsonb,
  result_count bigint,
  latency_ms double precision,
  result_ids uuid[]
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.search_telemetry (
    search_id, user_id, api, caller, query, result_count, latency_ms, result_ids
  )
  values (search_id, auth.uid(), api, 'app', query, result_count, latency_ms, result_ids);
$$;

revoke all on function private.record_search(uuid, public.search_api, jsonb, bigint, double precision, uuid[]) from public;

create function public.search_catalog(query jsonb)
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
    where field not in ('sort', 'sort_order', 'limit', 'include_oracle_text', 'cursor')
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
      'case when c.name_key = %1$L or %1$L = any (string_to_array(c.name_key, ''/'')) then 0 '
      'when c.name_key like %2$L then 1 ',
      text_key,
      '%' || text_key || '%'
    );
    if numnode(text_query::tsquery) > 0 then
      conditions := conditions || format(
        '(c.name_key like %L or c.search_vector @@ %L::tsquery)',
        '%' || text_key || '%',
        text_query
      );
      text_rank := format('-ts_rank(c.search_vector, %L::tsquery)::numeric', text_query);
      tier := name_match || format(
        'when ts_filter(c.search_vector, ''{a}'') @@ %1$L::tsquery then 1 '
        'when ts_filter(c.search_vector, ''{c}'') @@ %1$L::tsquery then 3 else 4 end',
        text_query
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
      'price_from', null,
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

revoke all on function public.search_catalog(jsonb) from public, anon, service_role;
grant execute on function public.search_catalog(jsonb) to authenticated;

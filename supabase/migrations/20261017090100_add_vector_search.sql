create extension if not exists vector with schema extensions;

create table public.card_embeddings (
  oracle_id uuid primary key references public.cards (oracle_id),
  embedding_text_md5 text not null,
  embedding extensions.halfvec(384) not null
);

create index card_embeddings_embedding
  on public.card_embeddings using hnsw (embedding extensions.halfvec_cosine_ops);

alter table public.card_embeddings enable row level security;

revoke all on table public.card_embeddings from anon, authenticated;

grant select, insert, update, delete on table public.card_embeddings to catalog_importer;

create policy "The import role writes card embeddings"
  on public.card_embeddings
  for all
  to catalog_importer
  using (true)
  with check (true);

create unlogged table catalog_import.card_embeddings (
  run_id uuid not null,
  batch_number integer not null,
  oracle_id uuid,
  embedding_text_md5 text,
  embedding extensions.halfvec(384)
);

create index card_embeddings_run_batch on catalog_import.card_embeddings (run_id, batch_number);

alter table catalog_import.card_embeddings owner to catalog_importer;

create or replace function catalog_import.staging_tables(source public.import_source)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case staging_tables.source
    when 'catalog' then array['cards', 'card_faces', 'card_printings']
    when 'oracle_tags' then array['oracle_tags', 'tag_edges', 'card_taggings']
    when 'prices' then array['card_prices']
    when 'commander_spellbook' then array['combos']
    when 'card_embeddings' then array['card_embeddings']
    else array[]::text[]
  end;
$$;


create function catalog_import.card_embedding_text(oracle_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select concat_ws(
    E'\n',
    c.name,
    c.type_line,
    nullif(c.oracle_text, ''),
    'Keywords: ' || nullif(array_to_string(c.keywords, ', '), ''),
    'Tags: ' || (
      select string_agg(t.label, ', ' order by t.label)
      from public.card_taggings g
      join public.oracle_tags t on t.id = g.tag_id
      where g.oracle_id = c.oracle_id
        and not exists (select 1 from public.disabled_tags d where d.tag_id = t.id)
    )
  )
  from public.cards c
  where c.oracle_id = card_embedding_text.oracle_id;
$$;

create function public.list_card_embedding_texts(after_oracle_id uuid default null, row_limit integer default 1000)
returns table (oracle_id uuid, embedding_text text, embedding_text_md5 text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.oracle_id, t.embedding_text, md5(t.embedding_text)
  from public.cards c
  cross join lateral (select catalog_import.card_embedding_text(c.oracle_id) as embedding_text) t
  left join public.card_embeddings e on e.oracle_id = c.oracle_id
  where (list_card_embedding_texts.after_oracle_id is null or c.oracle_id > list_card_embedding_texts.after_oracle_id)
    and e.embedding_text_md5 is distinct from md5(t.embedding_text)
  order by c.oracle_id
  limit list_card_embedding_texts.row_limit;
$$;

create function catalog_import.merge_card_embeddings(run public.import_runs, staged_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  staged_embeddings bigint;
  missing bigint;
  changed_texts bigint;
  embeddings_inserted bigint;
  embeddings_updated bigint;
  cards_without_embedding bigint;
begin
  select count(*), count(*) filter (where num_nulls(oracle_id, embedding_text_md5, embedding) > 0)
    into staged_embeddings, missing
    from catalog_import.card_embeddings s
    where s.run_id = run.id;
  perform catalog_import.check_staged_rows(
    run.id, 'card_embeddings', coalesce(staged_rows -> 'card_embeddings', '0'), staged_embeddings, missing
  );

  select count(*) into changed_texts
    from catalog_import.card_embeddings s
    where s.run_id = run.id
      and md5(catalog_import.card_embedding_text(s.oracle_id)) is distinct from s.embedding_text_md5;
  if changed_texts > 0 then
    raise exception 'card_embeddings: the card text of % staged rows changed during the run', changed_texts;
  end if;

  with merged as (
    insert into public.card_embeddings as live (oracle_id, embedding_text_md5, embedding)
    select s.oracle_id, s.embedding_text_md5, s.embedding
    from catalog_import.card_embeddings s
    where s.run_id = run.id
    on conflict (oracle_id) do update set
      embedding_text_md5 = excluded.embedding_text_md5,
      embedding = excluded.embedding
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into embeddings_inserted, embeddings_updated
    from merged;

  select count(*) into cards_without_embedding
    from public.cards c
    left join public.card_embeddings e on e.oracle_id = c.oracle_id
    where e.embedding_text_md5 is distinct from md5(catalog_import.card_embedding_text(c.oracle_id));
  if cards_without_embedding > 0 then
    raise exception 'card_embeddings: % cards have no embedding of their current card text', cards_without_embedding;
  end if;

  return jsonb_build_object(
    'card_embeddings', jsonb_build_object(
      'staged', staged_embeddings,
      'inserted', embeddings_inserted,
      'updated', embeddings_updated
    )
  );
end;
$$;

create or replace function public.finish_import_run(run_id uuid, staged_rows jsonb)
returns public.import_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.import_runs;
  merge_started_at timestamptz := clock_timestamp();
  merge_counts jsonb;
begin
  select * into run from public.import_runs r where r.id = finish_import_run.run_id for update;
  if not found or run.status <> 'running' then
    raise exception 'Import run % is not open', finish_import_run.run_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  begin
    case run.source
      when 'catalog' then
        merge_counts := catalog_import.merge_catalog(run, finish_import_run.staged_rows);
      when 'oracle_tags' then
        merge_counts := catalog_import.merge_oracle_tags(run, finish_import_run.staged_rows);
      when 'prices' then
        merge_counts := catalog_import.merge_prices(run, finish_import_run.staged_rows);
      when 'commander_spellbook' then
        merge_counts := catalog_import.merge_combos(run, finish_import_run.staged_rows);
      when 'card_embeddings' then
        merge_counts := catalog_import.merge_card_embeddings(run, finish_import_run.staged_rows);
      else
        raise exception 'No merge exists for % imports', run.source;
    end case;

    update public.import_runs r
      set status = 'succeeded',
        finished_at = clock_timestamp(),
        merge_duration = clock_timestamp() - merge_started_at,
        counts = merge_counts
      where r.id = run.id
      returning * into run;

    insert into public.import_snapshots (source, snapshot_at, succeeded_at, run_id)
      values (
        run.source,
        case when run.source = 'prices' then run.started_at else run.source_updated_at end,
        run.finished_at,
        run.id
      )
      on conflict (source) do update set
        snapshot_at = excluded.snapshot_at,
        succeeded_at = excluded.succeeded_at,
        run_id = excluded.run_id;
  exception when others then
    update public.import_runs r
      set status = 'failed',
        finished_at = clock_timestamp(),
        failure_reason = sqlerrm
      where r.id = run.id
      returning * into run;
  end;

  perform catalog_import.clear_staging(run.source);
  return run;
end;
$$;

create or replace function public.catalog_storage_sizes()
returns table (relation text, total_bytes bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select t.relation, pg_total_relation_size(t.relation::regclass)
  from unnest(array[
    'public.cards',
    'public.card_faces',
    'public.card_printings',
    'public.card_prices',
    'public.card_lowest_prices',
    'public.oracle_tags',
    'public.tag_edges',
    'public.card_taggings',
    'public.combos',
    'public.card_embeddings',
    'public.import_runs',
    'public.import_snapshots'
  ]) as t(relation)
  union all
  select 'database', pg_database_size(current_database());
$$;


create function private.checked_text_embedding(field text, value jsonb)
returns extensions.halfvec(384)
language plpgsql
immutable
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'array'
    or jsonb_array_length(value) <> 384
    or exists (
      select 1
      from jsonb_array_elements(value) as element
      where jsonb_typeof(element) <> 'number' or element::numeric not between -1 and 1
    ) then
    perform private.invalid_argument(field, format('%s must be a list of 384 numbers from -1 to 1.', field));
  end if;
  return value::text::extensions.halfvec(384);
end;
$$;

drop function public.search_catalog(jsonb);

create function public.search_catalog(query jsonb, text_embedding jsonb default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  started_at timestamptz := clock_timestamp();
  telemetry_ids constant integer := 20;
  nearest_cards constant integer := 100;
  fusion_offset constant integer := 60;
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
  query_embedding extensions.halfvec(384);
  matches_query text;
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

  if text_embedding is not null and jsonb_typeof(text_embedding) <> 'null' then
    if not checked ? 'text' then
      perform private.invalid_argument('text_embedding', 'text_embedding needs text in the query.');
    end if;
    if checked ->> 'sort' = 'relevance' then
      query_embedding := private.checked_text_embedding('text_embedding', text_embedding);
    end if;
  end if;

  page_size := (checked ->> 'limit')::integer;
  query_hash := md5(
    'catalog ' || (checked - array['cursor', 'limit', 'include_oracle_text'])::text
      || coalesce(' ' || query_embedding::text, '')
  );
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

  if query_embedding is null then
    matches_query := format(
      'select c.oracle_id, c.name_key, keys.sort_flag, keys.sort_primary, keys.sort_secondary '
      'from public.cards c '
      'cross join lateral (select %1$s) as keys(sort_flag, sort_primary, sort_secondary) '
      'where %2$s',
      sort_columns,
      array_to_string(conditions, ' and ')
    );
  else
    perform set_config('hnsw.ef_search', nearest_cards::text, true);
    perform set_config('hnsw.iterative_scan', 'relaxed_order', true);
    matches_query := format(
      $matches$
        with lexical as (
          select c.oracle_id, least(%1$s, 2) as name_tier,
            row_number() over (order by %1$s, %2$s, c.name_key, c.oracle_id) as lexical_rank
          from public.cards c
          where %3$s
        ),
        nearest as (
          select n.oracle_id, row_number() over (order by n.distance, n.oracle_id) as vector_rank
          from (
            select c.oracle_id, e.embedding operator(extensions.<=>) $2 as distance
            from public.card_embeddings e
            join public.cards c on c.oracle_id = e.oracle_id
            where %4$s
            order by e.embedding operator(extensions.<=>) $2
            limit %5$s
          ) n
        )
        select c.oracle_id, c.name_key, false as sort_flag,
          coalesce(l.name_tier, 2)::numeric as sort_primary,
          -(coalesce(1.0 / (%6$s + l.lexical_rank), 0) + coalesce(1.0 / (%6$s + n.vector_rank), 0)) as sort_secondary
        from lexical l
        full join nearest n on n.oracle_id = l.oracle_id
        join public.cards c on c.oracle_id = coalesce(l.oracle_id, n.oracle_id)
      $matches$,
      tier,
      text_rank,
      array_to_string(conditions, ' and '),
      array_to_string(private.catalog_filter_conditions(checked), ' and '),
      nearest_cards,
      fusion_offset
    );
  end if;

  execute format(
    $sql$
      with matches as (%1$s),
      page as (
        select m.*, count(*) over () as total_count
        from matches m
        where $1 is null
          or (m.sort_flag, m.sort_primary, m.sort_secondary, m.name_key, m.oracle_id) %2$s (
            ($1 ->> 0)::boolean, ($1 ->> 1)::numeric, ($1 ->> 2)::numeric, $1 ->> 3, ($1 ->> 4)::uuid
          )
        order by %3$s
        limit %4$s
      )
      select
        coalesce(jsonb_agg(
          jsonb_build_array(p.sort_flag, p.sort_primary, p.sort_secondary, p.name_key, p.oracle_id)
          order by %3$s
        ), '[]'::jsonb),
        coalesce(max(p.total_count), 0)
      from page p
    $sql$,
    matches_query,
    case direction when 'asc' then '>' else '<' end,
    format(
      'sort_flag %1$s, sort_primary %1$s, sort_secondary %1$s, name_key %1$s, oracle_id %1$s',
      direction
    ),
    case when after_key is null then greatest(page_size, telemetry_ids) else page_size end + 1
  )
  into page_keys, total_count
  using after_key, query_embedding;

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

revoke all on function public.search_catalog(jsonb, jsonb) from public, anon;
grant execute on function public.search_catalog(jsonb, jsonb) to authenticated, service_role;

grant create on schema public to catalog_importer;

alter function catalog_import.card_embedding_text(uuid) owner to catalog_importer;
alter function catalog_import.merge_card_embeddings(public.import_runs, jsonb) owner to catalog_importer;
alter function public.list_card_embedding_texts(uuid, integer) owner to catalog_importer;

revoke create on schema public from catalog_importer;

revoke all on function public.list_card_embedding_texts(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_card_embedding_texts(uuid, integer) to service_role;

notify pgrst, 'reload config';

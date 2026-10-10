create function private.name_keys(phrases text[])
returns text[]
language sql
immutable
parallel safe
security definer
set search_path = ''
as $$
  select array(select private.name_key(phrase) from unnest(phrases) as phrase);
$$;

create function private.tag_search_vector(label text, aliases text[])
returns tsvector
language sql
immutable
parallel safe
set search_path = ''
as $$
  select setweight(to_tsvector('english'::regconfig, label), 'A')
    || setweight(to_tsvector('english'::regconfig, array_to_string(aliases, ' ')), 'B');
$$;

create table public.oracle_tags (
  id uuid primary key,
  slug text not null,
  label text not null,
  description text,
  aliases text[] not null,
  label_keys text[] generated always as (private.name_keys(array[slug, label])) stored,
  alias_keys text[] generated always as (private.name_keys(aliases)) stored,
  search_vector tsvector generated always as (private.tag_search_vector(label, aliases)) stored,
  constraint oracle_tags_slug_key unique (slug) deferrable initially deferred
);

create table public.tag_edges (
  parent_id uuid not null references public.oracle_tags (id),
  child_id uuid not null references public.oracle_tags (id),
  primary key (parent_id, child_id)
);

create table public.card_taggings (
  tag_id uuid not null references public.oracle_tags (id),
  oracle_id uuid not null references public.cards (oracle_id),
  primary key (tag_id, oracle_id)
);

create table public.disabled_tags (
  tag_id uuid primary key,
  disabled_at timestamptz not null default now()
);

create index oracle_tags_search_vector on public.oracle_tags using gin (search_vector);
create index oracle_tags_slug_label_trigrams
  on public.oracle_tags using gin ((slug || ' ' || label) extensions.gin_trgm_ops);
create index tag_edges_child_id on public.tag_edges (child_id);
create index card_taggings_oracle_id on public.card_taggings (oracle_id);

alter table public.oracle_tags enable row level security;
alter table public.tag_edges enable row level security;
alter table public.card_taggings enable row level security;
alter table public.disabled_tags enable row level security;

revoke all on table public.oracle_tags, public.tag_edges, public.card_taggings, public.disabled_tags
  from anon, authenticated;
grant select on table public.oracle_tags, public.tag_edges, public.card_taggings, public.disabled_tags
  to authenticated;

create policy "Signed-in users read Oracle tags"
  on public.oracle_tags
  for select
  to authenticated
  using (true);

create policy "Signed-in users read tag edges"
  on public.tag_edges
  for select
  to authenticated
  using (true);

create policy "Signed-in users read card taggings"
  on public.card_taggings
  for select
  to authenticated
  using (true);

create policy "Signed-in users read disabled tags"
  on public.disabled_tags
  for select
  to authenticated
  using (true);

grant select, insert, update, delete on table public.oracle_tags, public.tag_edges, public.card_taggings
  to catalog_importer;
grant select, insert, delete on table public.disabled_tags to catalog_importer;
revoke all on function private.name_keys(text[]) from public;
grant execute on function private.name_keys(text[]) to catalog_importer;

create policy "The import role writes Oracle tags"
  on public.oracle_tags
  for all
  to catalog_importer
  using (true)
  with check (true);

create policy "The import role writes tag edges"
  on public.tag_edges
  for all
  to catalog_importer
  using (true)
  with check (true);

create policy "The import role writes card taggings"
  on public.card_taggings
  for all
  to catalog_importer
  using (true)
  with check (true);

create policy "The import role writes disabled tags"
  on public.disabled_tags
  for all
  to catalog_importer
  using (true)
  with check (true);

create unlogged table catalog_import.oracle_tags (
  run_id uuid not null,
  batch_number integer not null,
  id uuid,
  slug text,
  label text,
  description text,
  aliases text[]
);

create unlogged table catalog_import.tag_edges (
  run_id uuid not null,
  batch_number integer not null,
  parent_id uuid,
  child_id uuid
);

create unlogged table catalog_import.card_taggings (
  run_id uuid not null,
  batch_number integer not null,
  tag_id uuid,
  oracle_id uuid
);

create index oracle_tags_run_batch on catalog_import.oracle_tags (run_id, batch_number);
create index tag_edges_run_batch on catalog_import.tag_edges (run_id, batch_number);
create index card_taggings_run_batch on catalog_import.card_taggings (run_id, batch_number);

alter table catalog_import.oracle_tags owner to catalog_importer;
alter table catalog_import.tag_edges owner to catalog_importer;
alter table catalog_import.card_taggings owner to catalog_importer;

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
    else array[]::text[]
  end;
$$;

create function catalog_import.merge_oracle_tags(run public.import_runs, staged_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  staged_tags bigint;
  staged_edges bigint;
  staged_taggings bigint;
  missing bigint;
  dropped_edges bigint;
  dropped_taggings bigint;
  tags_inserted bigint;
  tags_updated bigint;
  tags_deleted bigint;
  edges_inserted bigint;
  edges_deleted bigint;
  taggings_inserted bigint;
  taggings_deleted bigint;
begin
  select count(*), count(*) filter (where num_nulls(id, slug, label, aliases) > 0)
    into staged_tags, missing
    from catalog_import.oracle_tags t
    where t.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'oracle_tags', staged_rows -> 'oracle_tags', staged_tags, missing);

  select count(*), count(*) filter (where num_nulls(parent_id, child_id) > 0)
    into staged_edges, missing
    from catalog_import.tag_edges e
    where e.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'tag_edges', staged_rows -> 'tag_edges', staged_edges, missing);

  select count(*), count(*) filter (where num_nulls(tag_id, oracle_id) > 0)
    into staged_taggings, missing
    from catalog_import.card_taggings g
    where g.run_id = run.id;
  perform catalog_import.check_staged_rows(
    run.id, 'card_taggings', staged_rows -> 'card_taggings', staged_taggings, missing
  );

  delete from catalog_import.tag_edges e
    where e.run_id = run.id
      and (
        not exists (select 1 from catalog_import.oracle_tags t where t.run_id = run.id and t.id = e.parent_id)
        or not exists (select 1 from catalog_import.oracle_tags t where t.run_id = run.id and t.id = e.child_id)
      );
  get diagnostics dropped_edges = row_count;

  delete from catalog_import.card_taggings g
    where g.run_id = run.id
      and (
        not exists (select 1 from public.cards c where c.oracle_id = g.oracle_id)
        or not exists (select 1 from catalog_import.oracle_tags t where t.run_id = run.id and t.id = g.tag_id)
      );
  get diagnostics dropped_taggings = row_count;

  perform catalog_import.check_shrink(
    'oracle_tags',
    (select count(*) from public.oracle_tags),
    staged_tags,
    run.accept_shrink
  );
  perform catalog_import.check_shrink(
    'tag_edges',
    (select count(*) from public.tag_edges),
    staged_edges - dropped_edges,
    run.accept_shrink
  );
  perform catalog_import.check_shrink(
    'card_taggings',
    (select count(*) from public.card_taggings),
    staged_taggings - dropped_taggings,
    run.accept_shrink
  );

  delete from public.card_taggings live
    where not exists (
      select 1
      from catalog_import.card_taggings g
      where g.run_id = run.id and g.tag_id = live.tag_id and g.oracle_id = live.oracle_id
    );
  get diagnostics taggings_deleted = row_count;

  delete from public.tag_edges live
    where not exists (
      select 1
      from catalog_import.tag_edges e
      where e.run_id = run.id and e.parent_id = live.parent_id and e.child_id = live.child_id
    );
  get diagnostics edges_deleted = row_count;

  delete from public.oracle_tags live
    where not exists (select 1 from catalog_import.oracle_tags t where t.run_id = run.id and t.id = live.id);
  get diagnostics tags_deleted = row_count;

  with merged as (
    insert into public.oracle_tags as live (id, slug, label, description, aliases)
    select t.id, t.slug, t.label, t.description, t.aliases
    from catalog_import.oracle_tags t
    where t.run_id = run.id
    on conflict (id) do update set
      slug = excluded.slug,
      label = excluded.label,
      description = excluded.description,
      aliases = excluded.aliases
    where (live.slug, live.label, live.description, live.aliases)
      is distinct from (excluded.slug, excluded.label, excluded.description, excluded.aliases)
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into tags_inserted, tags_updated
    from merged;

  insert into public.tag_edges (parent_id, child_id)
    select distinct e.parent_id, e.child_id
    from catalog_import.tag_edges e
    where e.run_id = run.id
    on conflict do nothing;
  get diagnostics edges_inserted = row_count;

  insert into public.card_taggings (tag_id, oracle_id)
    select distinct g.tag_id, g.oracle_id
    from catalog_import.card_taggings g
    where g.run_id = run.id
    on conflict do nothing;
  get diagnostics taggings_inserted = row_count;

  return jsonb_build_object(
    'oracle_tags', jsonb_build_object(
      'staged', staged_tags,
      'inserted', tags_inserted,
      'updated', tags_updated,
      'deleted', tags_deleted
    ),
    'tag_edges', jsonb_build_object(
      'staged', staged_edges,
      'accepted', staged_edges - dropped_edges,
      'dropped', dropped_edges,
      'inserted', edges_inserted,
      'deleted', edges_deleted
    ),
    'card_taggings', jsonb_build_object(
      'staged', staged_taggings,
      'accepted', staged_taggings - dropped_taggings,
      'dropped', dropped_taggings,
      'inserted', taggings_inserted,
      'deleted', taggings_deleted
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

create function public.disable_oracle_tag(tag_id uuid)
returns table (id uuid, slug text, disabled boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.oracle_tags t where t.id = disable_oracle_tag.tag_id) then
    raise exception 'No Oracle tag has the ID %', disable_oracle_tag.tag_id
      using errcode = 'no_data_found';
  end if;
  insert into public.disabled_tags (tag_id)
    values (disable_oracle_tag.tag_id)
    on conflict on constraint disabled_tags_pkey do nothing;
  return query
    select t.id, t.slug, true
    from public.oracle_tags t
    where t.id = disable_oracle_tag.tag_id;
end;
$$;

create function public.enable_oracle_tag(tag_id uuid)
returns table (id uuid, slug text, disabled boolean)
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.disabled_tags d where d.tag_id = enable_oracle_tag.tag_id;
  if not found then
    raise exception 'The Oracle tag % is not disabled', enable_oracle_tag.tag_id
      using errcode = 'no_data_found';
  end if;
  return query
    select
      enable_oracle_tag.tag_id,
      (select t.slug from public.oracle_tags t where t.id = enable_oracle_tag.tag_id),
      false;
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
    'public.import_runs',
    'public.import_snapshots'
  ]) as t(relation)
  union all
  select 'database', pg_database_size(current_database());
$$;

alter function catalog_import.merge_oracle_tags(public.import_runs, jsonb) owner to catalog_importer;

grant create on schema public to catalog_importer;
alter function public.disable_oracle_tag(uuid) owner to catalog_importer;
alter function public.enable_oracle_tag(uuid) owner to catalog_importer;
revoke create on schema public from catalog_importer;

revoke all on function public.disable_oracle_tag(uuid) from public, anon, authenticated;
revoke all on function public.enable_oracle_tag(uuid) from public, anon, authenticated;
grant execute on function public.disable_oracle_tag(uuid) to service_role;
grant execute on function public.enable_oracle_tag(uuid) to service_role;

create function private.tag_closure(root_ids uuid[])
returns setof uuid
language sql
stable
set search_path = ''
as $$
  with recursive closure (tag_id) as (
    select t.id
    from public.oracle_tags t
    where t.id = any (root_ids)
      and not exists (select 1 from public.disabled_tags d where d.tag_id = t.id)
    union
    select e.child_id
    from closure
    join public.tag_edges e on e.parent_id = closure.tag_id
    where not exists (select 1 from public.disabled_tags d where d.tag_id = e.child_id)
  )
  select closure.tag_id from closure;
$$;

create function private.tagged_cards_condition(root_tags_query text)
returns text
language sql
immutable
set search_path = ''
as $$
  select format(
    'c.oracle_id in (select ct.oracle_id from public.card_taggings ct '
    'where ct.tag_id in (select closure.tag_id from private.tag_closure(array(%s)) as closure(tag_id)))',
    root_tags_query
  );
$$;

create function private.checked_tag_slugs(field text, value jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  lowered jsonb;
  item_index bigint;
  item text;
begin
  perform private.checked_text_list(field, value);
  lowered := (select jsonb_agg(lower(element)) from jsonb_array_elements_text(value) as element);
  perform private.checked_list(field, lowered, 1, 10);
  for item, item_index in
    select element, ordinality - 1 from jsonb_array_elements_text(lowered) with ordinality as e(element, ordinality)
  loop
    if not exists (
      select 1
      from public.oracle_tags t
      where t.slug = item
        and not exists (select 1 from public.disabled_tags d where d.tag_id = t.id)
    ) then
      perform private.invalid_argument(
        format('%s[%s]', field, item_index),
        format(
          '%s[%s] is not a known Oracle tag slug. Use the tag lookup to find tag slugs.',
          field,
          item_index
        )
      );
    end if;
  end loop;
  return lowered;
end;
$$;

create or replace function private.check_search_query(query jsonb)
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

create or replace function private.catalog_filter_conditions(checked jsonb)
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

  if checked ? 'price_min' or checked ? 'price_max' then
    conditions := conditions || format(
      'exists (select 1 from public.card_lowest_prices lp where lp.oracle_id = c.oracle_id '
      'and lp.currency = %L and lp.amount_cents::numeric between %L and %L)',
      checked ->> 'price_currency',
      coalesce(round((checked ->> 'price_min')::numeric * 100), 0),
      coalesce(round((checked ->> 'price_max')::numeric * 100), 'Infinity')
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
      'case when c.name_key = %1$L or %1$L = any (string_to_array(c.name_key, ''/'')) then 0 '
      'when c.name_key like %2$L then 1 ',
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
        'when ts_filter(c.search_vector, ''{a}'') @@ %1$L::tsquery then 1 '
        'when %2$s then 2 '
        'when ts_filter(c.search_vector, ''{c}'') @@ %1$L::tsquery then 3 else 4 end',
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

create function public.search_oracle_tags(query jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  rules_freshness record;
  field text;
  value jsonb;
  lookup_text text;
  row_limit integer := 10;
  text_key text;
  text_query tsquery;
  pattern text;
  items jsonb;
begin
  select * into rules_freshness from public.catalog_freshness() f where f.source = 'catalog';
  if rules_freshness.snapshot_at is null then
    perform private.raise_search_error(
      'data_unavailable',
      'No card catalog import has succeeded yet. Try again later.'
    );
  end if;

  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;
  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    case field
      when 'text' then
        lookup_text := private.checked_text(field, value, 100) #>> '{}';
      when 'limit' then
        row_limit := private.checked_integer(field, value, 1, 20)::integer;
      else
        perform private.invalid_argument(field, format('%s is not a known field.', field));
    end case;
  end loop;
  if lookup_text is null then
    perform private.invalid_argument('text', 'text is required.');
  end if;

  text_key := private.name_key(lookup_text);
  text_query := plainto_tsquery('english', lookup_text);
  pattern := '%' || replace(replace(replace(lookup_text, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  with candidates as (
    select
      t.id,
      t.slug,
      t.label,
      t.aliases,
      t.description,
      case
        when text_key = any (t.label_keys) then 0
        when text_key = any (t.alias_keys) then 1
        else 2
      end as match_tier,
      ts_rank(t.search_vector, text_query) as text_rank
    from public.oracle_tags t
    where (
        text_key = any (t.label_keys)
        or text_key = any (t.alias_keys)
        or t.search_vector @@ text_query
        or (t.slug || ' ' || t.label) ilike pattern
      )
      and not exists (select 1 from public.disabled_tags d where d.tag_id = t.id)
  ),
  ranked as (
    select
      candidate.*,
      (
        select count(distinct ct.oracle_id)
        from private.tag_closure(array[candidate.id]) as closure(tag_id)
        join public.card_taggings ct on ct.tag_id = closure.tag_id
        join public.cards c on c.oracle_id = ct.oracle_id
        where c.commander_legality = 'legal'
          and c.absent_since is null
      ) as card_count
    from candidates candidate
  ),
  top as (
    select *
    from ranked
    order by match_tier, text_rank desc, card_count desc, slug, id
    limit row_limit
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', top.id,
      'slug', top.slug,
      'label', top.label,
      'aliases', to_jsonb(top.aliases),
      'description', top.description,
      'parent_slugs', to_jsonb(array(
        select parent.slug
        from public.tag_edges e
        join public.oracle_tags parent on parent.id = e.parent_id
        where e.child_id = top.id
          and not exists (select 1 from public.disabled_tags d where d.tag_id = parent.id)
        order by parent.slug
      )),
      'card_count', top.card_count
    )
    order by top.match_tier, top.text_rank desc, top.card_count desc, top.slug, top.id
  ), '[]'::jsonb)
  into items
  from top;

  return jsonb_build_object(
    'items', items,
    'rules_data_as_of', rules_freshness.snapshot_at,
    'rules_stale', rules_freshness.is_stale
  );
end;
$$;

revoke all on function public.search_oracle_tags(jsonb) from public, anon, service_role;
grant execute on function public.search_oracle_tags(jsonb) to authenticated;

notify pgrst, 'reload config';

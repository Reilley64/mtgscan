create type public.combo_bracket_tag as enum (
  'ruthless',
  'spicy',
  'powerful',
  'oddball',
  'core',
  'exhibition',
  'banned'
);

create table public.combos (
  id text primary key,
  first_oracle_id uuid not null references public.cards (oracle_id),
  second_oracle_id uuid not null references public.cards (oracle_id),
  color_identity text[] not null,
  produced_features text[] not null,
  bracket_tag public.combo_bracket_tag not null
);

create index combos_first_oracle_id on public.combos (first_oracle_id);
create index combos_second_oracle_id on public.combos (second_oracle_id);

alter table public.combos enable row level security;

revoke all on table public.combos from anon, authenticated;
grant select on table public.combos to authenticated;

create policy "Signed-in users read combos"
  on public.combos
  for select
  to authenticated
  using (true);

grant select, insert, update, delete on table public.combos to catalog_importer;

create policy "The import role writes combos"
  on public.combos
  for all
  to catalog_importer
  using (true)
  with check (true);

create unlogged table catalog_import.combos (
  run_id uuid not null,
  batch_number integer not null,
  id text,
  first_oracle_id uuid,
  second_oracle_id uuid,
  color_identity text[],
  produced_features text[],
  bracket_tag public.combo_bracket_tag
);

create index combos_run_batch on catalog_import.combos (run_id, batch_number);

alter table catalog_import.combos owner to catalog_importer;

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
    else array[]::text[]
  end;
$$;

create function catalog_import.merge_combos(run public.import_runs, staged_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  staged_combos bigint;
  missing bigint;
  dropped_combos bigint;
  combos_inserted bigint;
  combos_updated bigint;
  combos_deleted bigint;
begin
  select count(*), count(*) filter (
      where num_nulls(id, first_oracle_id, second_oracle_id, color_identity, produced_features, bracket_tag) > 0
    )
    into staged_combos, missing
    from catalog_import.combos s
    where s.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'combos', staged_rows -> 'combos', staged_combos, missing);

  delete from catalog_import.combos s
    where s.run_id = run.id
      and (
        not exists (select 1 from public.cards c where c.oracle_id = s.first_oracle_id)
        or not exists (select 1 from public.cards c where c.oracle_id = s.second_oracle_id)
      );
  get diagnostics dropped_combos = row_count;

  perform catalog_import.check_shrink(
    'combos',
    (select count(*) from public.combos),
    staged_combos - dropped_combos,
    run.accept_shrink
  );

  delete from public.combos live
    where not exists (select 1 from catalog_import.combos s where s.run_id = run.id and s.id = live.id);
  get diagnostics combos_deleted = row_count;

  with merged as (
    insert into public.combos as live (
      id, first_oracle_id, second_oracle_id, color_identity, produced_features, bracket_tag
    )
    select s.id, s.first_oracle_id, s.second_oracle_id, s.color_identity, s.produced_features, s.bracket_tag
    from catalog_import.combos s
    where s.run_id = run.id
    on conflict (id) do update set
      first_oracle_id = excluded.first_oracle_id,
      second_oracle_id = excluded.second_oracle_id,
      color_identity = excluded.color_identity,
      produced_features = excluded.produced_features,
      bracket_tag = excluded.bracket_tag
    where (
      live.first_oracle_id, live.second_oracle_id, live.color_identity, live.produced_features, live.bracket_tag
    ) is distinct from (
      excluded.first_oracle_id, excluded.second_oracle_id, excluded.color_identity, excluded.produced_features,
      excluded.bracket_tag
    )
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into combos_inserted, combos_updated
    from merged;

  return jsonb_build_object(
    'combos', jsonb_build_object(
      'staged', staged_combos,
      'accepted', staged_combos - dropped_combos,
      'dropped', dropped_combos,
      'inserted', combos_inserted,
      'updated', combos_updated,
      'deleted', combos_deleted
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
    'public.import_runs',
    'public.import_snapshots'
  ]) as t(relation)
  union all
  select 'database', pg_database_size(current_database());
$$;

alter function catalog_import.merge_combos(public.import_runs, jsonb) owner to catalog_importer;

notify pgrst, 'reload config';

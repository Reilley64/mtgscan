create table public.exchange_rates (
  currency text primary key check (currency ~ '^[A-Z]{3}$'),
  rate numeric not null check (rate > 0),
  rate_date date not null
);

alter table public.exchange_rates enable row level security;

revoke all on table public.exchange_rates from anon, authenticated;
grant select on table public.exchange_rates to authenticated;

create policy "Signed-in users read exchange rates"
  on public.exchange_rates
  for select
  to authenticated
  using (true);

grant select, insert, update, delete on table public.exchange_rates to catalog_importer;

create policy "The import role writes exchange rates"
  on public.exchange_rates
  for all
  to catalog_importer
  using (true)
  with check (true);

create unlogged table catalog_import.exchange_rates (
  run_id uuid not null,
  batch_number integer not null,
  currency text,
  rate numeric,
  rate_date date
);

create index exchange_rates_run_batch on catalog_import.exchange_rates (run_id, batch_number);

alter table catalog_import.exchange_rates owner to catalog_importer;

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
    when 'exchange_rates' then array['exchange_rates']
    else array[]::text[]
  end;
$$;

create function catalog_import.merge_exchange_rates(run public.import_runs, staged_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  staged_rates bigint;
  missing bigint;
  rates_inserted bigint;
  rates_updated bigint;
  rates_deleted bigint;
begin
  select count(*), count(*) filter (where num_nulls(s.currency, s.rate, s.rate_date) > 0)
    into staged_rates, missing
    from catalog_import.exchange_rates s
    where s.run_id = run.id;
  perform catalog_import.check_staged_rows(
    run.id, 'exchange_rates', staged_rows -> 'exchange_rates', staged_rates, missing
  );

  perform catalog_import.check_shrink(
    'exchange_rates',
    (select count(*) from public.exchange_rates),
    staged_rates,
    run.accept_shrink
  );

  delete from public.exchange_rates live
    where not exists (
      select 1 from catalog_import.exchange_rates s where s.run_id = run.id and s.currency = live.currency
    );
  get diagnostics rates_deleted = row_count;

  with merged as (
    insert into public.exchange_rates as live (currency, rate, rate_date)
    select s.currency, s.rate, s.rate_date
    from catalog_import.exchange_rates s
    where s.run_id = run.id
    on conflict (currency) do update set
      rate = excluded.rate,
      rate_date = excluded.rate_date
    where (live.rate, live.rate_date) is distinct from (excluded.rate, excluded.rate_date)
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into rates_inserted, rates_updated
    from merged;

  return jsonb_build_object(
    'exchange_rates', jsonb_build_object(
      'staged', staged_rates,
      'inserted', rates_inserted,
      'updated', rates_updated,
      'deleted', rates_deleted
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
      when 'exchange_rates' then
        merge_counts := catalog_import.merge_exchange_rates(run, finish_import_run.staged_rows);
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
    'public.exchange_rates',
    'public.import_runs',
    'public.import_snapshots'
  ]) as t(relation)
  union all
  select 'database', pg_database_size(current_database());
$$;

alter function catalog_import.merge_exchange_rates(public.import_runs, jsonb) owner to catalog_importer;

notify pgrst, 'reload config';

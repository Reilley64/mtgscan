create type public.import_source as enum ('catalog', 'oracle_tags', 'commander_spellbook', 'prices');

create type public.import_run_status as enum ('running', 'succeeded', 'failed', 'skipped', 'expired');

create type public.commander_legality as enum ('legal', 'banned', 'not_legal', 'unknown');

create type public.card_rarity as enum ('common', 'uncommon', 'rare', 'mythic', 'special', 'bonus');

create type public.card_finish as enum ('nonfoil', 'foil', 'etched');

create table public.cards (
  oracle_id uuid primary key,
  name text not null,
  mana_cost text not null,
  mana_value numeric not null,
  colors text[] not null,
  color_identity text[] not null,
  keywords text[] not null,
  type_line text not null,
  oracle_text text not null,
  edhrec_rank integer,
  commander_legality public.commander_legality not null,
  is_game_changer boolean,
  can_be_commander boolean not null,
  released_at date not null,
  absent_since timestamptz
);

create table public.card_faces (
  oracle_id uuid not null references public.cards (oracle_id),
  face_index smallint not null,
  name text not null,
  mana_cost text not null,
  type_line text not null,
  oracle_text text not null,
  colors text[] not null,
  power text,
  toughness text,
  loyalty text,
  primary key (oracle_id, face_index)
);

create table public.card_printings (
  id uuid primary key,
  oracle_id uuid not null references public.cards (oracle_id),
  set_code text not null,
  set_name text not null,
  collector_number text not null,
  lang text not null,
  rarity public.card_rarity not null,
  released_at date not null,
  finishes public.card_finish[] not null,
  illustration_id uuid,
  image_uris text[] not null,
  absent_since timestamptz
);

create index card_printings_oracle_id on public.card_printings (oracle_id);
create index card_printings_set_code on public.card_printings (set_code);
create unique index card_printings_set_collector_number_lang
  on public.card_printings (set_code, collector_number, lang);

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  source public.import_source not null,
  status public.import_run_status not null default 'running',
  source_updated_at timestamptz not null,
  accept_shrink boolean not null default false,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration interval generated always as (finished_at - started_at) stored,
  merge_duration interval,
  counts jsonb,
  failure_reason text
);

create unique index import_runs_one_open_run_per_source
  on public.import_runs (source)
  where status = 'running';
create index import_runs_source_started_at on public.import_runs (source, started_at desc);

create table public.import_snapshots (
  source public.import_source primary key,
  snapshot_at timestamptz not null,
  succeeded_at timestamptz not null,
  run_id uuid not null references public.import_runs (id)
);

alter table public.cards enable row level security;
alter table public.card_faces enable row level security;
alter table public.card_printings enable row level security;
alter table public.import_runs enable row level security;
alter table public.import_snapshots enable row level security;

revoke all on table public.cards, public.card_faces, public.card_printings from anon, authenticated;
revoke all on table public.import_runs, public.import_snapshots from anon, authenticated;
grant select on table public.cards, public.card_faces, public.card_printings to authenticated;

create policy "Signed-in users read cards"
  on public.cards
  for select
  to authenticated
  using (true);

create policy "Signed-in users read card faces"
  on public.card_faces
  for select
  to authenticated
  using (true);

create policy "Signed-in users read card printings"
  on public.card_printings
  for select
  to authenticated
  using (true);

create role catalog_importer nologin noinherit;
grant catalog_importer to postgres;

grant usage on schema public to catalog_importer;
grant select, insert, update on table public.cards, public.card_printings to catalog_importer;
grant select, insert, update, delete on table public.card_faces to catalog_importer;
grant select, insert, update on table public.import_runs, public.import_snapshots to catalog_importer;

create policy "The import role writes cards"
  on public.cards
  for all
  to catalog_importer
  using (true)
  with check (true);

create policy "The import role writes card faces"
  on public.card_faces
  for all
  to catalog_importer
  using (true)
  with check (true);

create policy "The import role writes card printings"
  on public.card_printings
  for all
  to catalog_importer
  using (true)
  with check (true);

create policy "The import role writes import runs"
  on public.import_runs
  for all
  to catalog_importer
  using (true)
  with check (true);

create policy "The import role writes import snapshots"
  on public.import_snapshots
  for all
  to catalog_importer
  using (true)
  with check (true);

create schema catalog_import authorization catalog_importer;

revoke all on schema catalog_import from public, anon, authenticated, service_role;

create unlogged table catalog_import.cards (
  run_id uuid not null,
  batch_number integer not null,
  oracle_id uuid,
  name text,
  mana_cost text,
  mana_value numeric,
  colors text[],
  color_identity text[],
  keywords text[],
  type_line text,
  oracle_text text,
  edhrec_rank integer,
  commander_legality public.commander_legality,
  is_game_changer boolean,
  can_be_commander boolean,
  released_at date
);

create unlogged table catalog_import.card_faces (
  run_id uuid not null,
  batch_number integer not null,
  oracle_id uuid,
  face_index smallint,
  name text,
  mana_cost text,
  type_line text,
  oracle_text text,
  colors text[],
  power text,
  toughness text,
  loyalty text
);

create unlogged table catalog_import.card_printings (
  run_id uuid not null,
  batch_number integer not null,
  id uuid,
  oracle_id uuid,
  set_code text,
  set_name text,
  collector_number text,
  lang text,
  rarity public.card_rarity,
  released_at date,
  finishes public.card_finish[],
  illustration_id uuid,
  image_uris text[]
);

create index cards_run_batch on catalog_import.cards (run_id, batch_number);
create index card_faces_run_batch on catalog_import.card_faces (run_id, batch_number);
create index card_printings_run_batch on catalog_import.card_printings (run_id, batch_number);

alter table catalog_import.cards owner to catalog_importer;
alter table catalog_import.card_faces owner to catalog_importer;
alter table catalog_import.card_printings owner to catalog_importer;

create function catalog_import.clear_staging(source public.import_source)
returns void
language plpgsql
set search_path = ''
as $$
begin
  case clear_staging.source
    when 'catalog' then
      truncate catalog_import.cards, catalog_import.card_faces, catalog_import.card_printings;
    else
      null;
  end case;
end;
$$;

create function catalog_import.check_staged_rows(
  run_id uuid,
  target text,
  expected jsonb,
  staged bigint,
  missing_required bigint
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if expected is null or jsonb_typeof(expected) <> 'number' then
    raise exception '%: the import job sent no row count', target;
  end if;
  if staged <> expected::bigint then
    raise exception '%: % of % staged rows arrived', target, staged, expected::bigint;
  end if;
  if missing_required > 0 then
    raise exception '%: required fields are missing in % staged rows', target, missing_required;
  end if;
end;
$$;

create function catalog_import.check_shrink(
  target text,
  live_rows bigint,
  new_rows bigint,
  accept_shrink boolean
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not accept_shrink and live_rows > 0 and new_rows < live_rows * 0.95 then
    raise exception '%: would shrink by more than 5%% (from % to % rows)', target, live_rows, new_rows;
  end if;
end;
$$;

create function catalog_import.merge_catalog(run public.import_runs, staged_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  staged_cards bigint;
  staged_faces bigint;
  staged_printings bigint;
  accepted_cards bigint;
  accepted_printings bigint;
  dropped_cards bigint;
  dropped_printings bigint;
  cards_inserted bigint;
  cards_updated bigint;
  cards_absent bigint;
  faces_inserted bigint;
  faces_updated bigint;
  faces_deleted bigint;
  printings_inserted bigint;
  printings_updated bigint;
  printings_absent bigint;
  missing bigint;
begin
  select count(*), count(*) filter (
      where num_nulls(oracle_id, name, mana_cost, mana_value, colors, color_identity, keywords,
        type_line, oracle_text, commander_legality, can_be_commander) > 0
    )
    into staged_cards, missing
    from catalog_import.cards c
    where c.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'cards', staged_rows -> 'cards', staged_cards, missing);

  select count(*), count(*) filter (
      where num_nulls(oracle_id, face_index, name, mana_cost, type_line, oracle_text, colors) > 0
    )
    into staged_faces, missing
    from catalog_import.card_faces f
    where f.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'card_faces', staged_rows -> 'card_faces', staged_faces, missing);

  select count(*), count(*) filter (
      where num_nulls(id, oracle_id, set_code, set_name, collector_number, lang, rarity, released_at,
        finishes, image_uris) > 0
    )
    into staged_printings, missing
    from catalog_import.card_printings p
    where p.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'card_printings', staged_rows -> 'card_printings', staged_printings, missing);

  delete from catalog_import.card_printings p
    where p.run_id = run.id
      and not exists (
        select 1 from catalog_import.cards c where c.run_id = run.id and c.oracle_id = p.oracle_id
      );
  get diagnostics dropped_printings = row_count;

  delete from catalog_import.cards c
    where c.run_id = run.id
      and not exists (
        select 1 from catalog_import.card_printings p where p.run_id = run.id and p.oracle_id = c.oracle_id
      );
  get diagnostics dropped_cards = row_count;

  delete from catalog_import.card_faces f
    where f.run_id = run.id
      and not exists (
        select 1 from catalog_import.cards c where c.run_id = run.id and c.oracle_id = f.oracle_id
      );

  update catalog_import.cards c
    set released_at = first_printing.released_at
    from (
      select p.oracle_id, min(p.released_at) as released_at
      from catalog_import.card_printings p
      where p.run_id = run.id
      group by p.oracle_id
    ) first_printing
    where c.run_id = run.id and c.oracle_id = first_printing.oracle_id;

  accepted_cards := staged_cards - dropped_cards;
  accepted_printings := staged_printings - dropped_printings;

  perform catalog_import.check_shrink(
    'cards',
    (select count(*) from public.cards where absent_since is null),
    accepted_cards,
    run.accept_shrink
  );
  perform catalog_import.check_shrink(
    'card_printings',
    (select count(*) from public.card_printings where absent_since is null),
    accepted_printings,
    run.accept_shrink
  );

  with merged as (
    insert into public.cards as live (
      oracle_id, name, mana_cost, mana_value, colors, color_identity, keywords, type_line,
      oracle_text, edhrec_rank, commander_legality, is_game_changer, can_be_commander, released_at
    )
    select
      oracle_id, name, mana_cost, mana_value, colors, color_identity, keywords, type_line,
      oracle_text, edhrec_rank, commander_legality, is_game_changer, can_be_commander, released_at
    from catalog_import.cards
    where run_id = run.id
    on conflict (oracle_id) do update set
      name = excluded.name,
      mana_cost = excluded.mana_cost,
      mana_value = excluded.mana_value,
      colors = excluded.colors,
      color_identity = excluded.color_identity,
      keywords = excluded.keywords,
      type_line = excluded.type_line,
      oracle_text = excluded.oracle_text,
      edhrec_rank = excluded.edhrec_rank,
      commander_legality = excluded.commander_legality,
      is_game_changer = excluded.is_game_changer,
      can_be_commander = excluded.can_be_commander,
      released_at = excluded.released_at,
      absent_since = null
    where (
      live.name, live.mana_cost, live.mana_value, live.colors, live.color_identity, live.keywords,
      live.type_line, live.oracle_text, live.edhrec_rank, live.commander_legality,
      live.is_game_changer, live.can_be_commander, live.released_at, live.absent_since
    ) is distinct from (
      excluded.name, excluded.mana_cost, excluded.mana_value, excluded.colors,
      excluded.color_identity, excluded.keywords, excluded.type_line, excluded.oracle_text,
      excluded.edhrec_rank, excluded.commander_legality, excluded.is_game_changer,
      excluded.can_be_commander, excluded.released_at, null::timestamptz
    )
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into cards_inserted, cards_updated
    from merged;

  update public.cards live
    set absent_since = now()
    where live.absent_since is null
      and not exists (
        select 1 from catalog_import.cards c where c.run_id = run.id and c.oracle_id = live.oracle_id
      );
  get diagnostics cards_absent = row_count;

  with merged as (
    insert into public.card_faces as live (
      oracle_id, face_index, name, mana_cost, type_line, oracle_text, colors, power, toughness, loyalty
    )
    select f.oracle_id, f.face_index, f.name, f.mana_cost, f.type_line, f.oracle_text, f.colors,
      f.power, f.toughness, f.loyalty
    from catalog_import.card_faces f
    where f.run_id = run.id
    on conflict (oracle_id, face_index) do update set
      name = excluded.name,
      mana_cost = excluded.mana_cost,
      type_line = excluded.type_line,
      oracle_text = excluded.oracle_text,
      colors = excluded.colors,
      power = excluded.power,
      toughness = excluded.toughness,
      loyalty = excluded.loyalty
    where (
      live.name, live.mana_cost, live.type_line, live.oracle_text, live.colors, live.power,
      live.toughness, live.loyalty
    ) is distinct from (
      excluded.name, excluded.mana_cost, excluded.type_line, excluded.oracle_text, excluded.colors,
      excluded.power, excluded.toughness, excluded.loyalty
    )
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into faces_inserted, faces_updated
    from merged;

  delete from public.card_faces live
    where exists (
        select 1 from catalog_import.cards c where c.run_id = run.id and c.oracle_id = live.oracle_id
      )
      and not exists (
        select 1
        from catalog_import.card_faces f
        where f.run_id = run.id and f.oracle_id = live.oracle_id and f.face_index = live.face_index
      );
  get diagnostics faces_deleted = row_count;

  with merged as (
    insert into public.card_printings as live (
      id, oracle_id, set_code, set_name, collector_number, lang, rarity, released_at, finishes,
      illustration_id, image_uris
    )
    select id, oracle_id, set_code, set_name, collector_number, lang, rarity, released_at, finishes,
      illustration_id, image_uris
    from catalog_import.card_printings
    where run_id = run.id
    on conflict (id) do update set
      oracle_id = excluded.oracle_id,
      set_code = excluded.set_code,
      set_name = excluded.set_name,
      collector_number = excluded.collector_number,
      lang = excluded.lang,
      rarity = excluded.rarity,
      released_at = excluded.released_at,
      finishes = excluded.finishes,
      illustration_id = excluded.illustration_id,
      image_uris = excluded.image_uris,
      absent_since = null
    where (
      live.oracle_id, live.set_code, live.set_name, live.collector_number, live.lang, live.rarity,
      live.released_at, live.finishes, live.illustration_id, live.image_uris, live.absent_since
    ) is distinct from (
      excluded.oracle_id, excluded.set_code, excluded.set_name, excluded.collector_number,
      excluded.lang, excluded.rarity, excluded.released_at, excluded.finishes,
      excluded.illustration_id, excluded.image_uris, null::timestamptz
    )
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into printings_inserted, printings_updated
    from merged;

  update public.card_printings live
    set absent_since = now()
    where live.absent_since is null
      and not exists (
        select 1 from catalog_import.card_printings p where p.run_id = run.id and p.id = live.id
      );
  get diagnostics printings_absent = row_count;

  return jsonb_build_object(
    'cards', jsonb_build_object(
      'staged', staged_cards,
      'accepted', accepted_cards,
      'dropped', dropped_cards,
      'inserted', cards_inserted,
      'updated', cards_updated,
      'marked_absent', cards_absent
    ),
    'card_faces', jsonb_build_object(
      'staged', staged_faces,
      'inserted', faces_inserted,
      'updated', faces_updated,
      'deleted', faces_deleted
    ),
    'card_printings', jsonb_build_object(
      'staged', staged_printings,
      'accepted', accepted_printings,
      'dropped', dropped_printings,
      'inserted', printings_inserted,
      'updated', printings_updated,
      'marked_absent', printings_absent
    )
  );
end;
$$;

create function public.begin_import_run(
  source public.import_source,
  source_updated_at timestamptz,
  accept_shrink boolean default false
)
returns public.import_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.import_runs;
  last_snapshot_at timestamptz;
begin
  update public.import_runs r
    set status = 'expired',
      finished_at = now(),
      failure_reason = 'The run stayed open for more than 2 hours'
    where r.source = begin_import_run.source
      and r.status = 'running'
      and r.started_at < now() - interval '2 hours';
  if found then
    perform catalog_import.clear_staging(begin_import_run.source);
  end if;

  select s.snapshot_at into last_snapshot_at
    from public.import_snapshots s
    where s.source = begin_import_run.source;

  if last_snapshot_at is not null and begin_import_run.source_updated_at <= last_snapshot_at then
    insert into public.import_runs (source, status, source_updated_at, accept_shrink, finished_at)
      values (
        begin_import_run.source,
        'skipped',
        begin_import_run.source_updated_at,
        begin_import_run.accept_shrink,
        now()
      )
      returning * into run;
    return run;
  end if;

  begin
    insert into public.import_runs (source, source_updated_at, accept_shrink)
      values (begin_import_run.source, begin_import_run.source_updated_at, begin_import_run.accept_shrink)
      returning * into run;
  exception when unique_violation then
    raise exception 'A % import run is already open', begin_import_run.source
      using errcode = 'object_in_use';
  end;
  return run;
end;
$$;

create function public.stage_import_batch(
  run_id uuid,
  target text,
  batch_number integer,
  batch_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.import_runs;
  staged integer;
begin
  select * into run from public.import_runs r where r.id = stage_import_batch.run_id;
  if not found or run.status <> 'running' then
    raise exception 'Import run % is not open', stage_import_batch.run_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if run.source = 'catalog' and stage_import_batch.target = 'cards' then
    delete from catalog_import.cards s
      where s.run_id = run.id and s.batch_number = stage_import_batch.batch_number;
    insert into catalog_import.cards
      select (jsonb_populate_record(
        null::catalog_import.cards,
        r || jsonb_build_object('run_id', run.id, 'batch_number', stage_import_batch.batch_number)
      )).*
      from jsonb_array_elements(stage_import_batch.batch_rows) r;
  elsif run.source = 'catalog' and stage_import_batch.target = 'card_faces' then
    delete from catalog_import.card_faces s
      where s.run_id = run.id and s.batch_number = stage_import_batch.batch_number;
    insert into catalog_import.card_faces
      select (jsonb_populate_record(
        null::catalog_import.card_faces,
        r || jsonb_build_object('run_id', run.id, 'batch_number', stage_import_batch.batch_number)
      )).*
      from jsonb_array_elements(stage_import_batch.batch_rows) r;
  elsif run.source = 'catalog' and stage_import_batch.target = 'card_printings' then
    delete from catalog_import.card_printings s
      where s.run_id = run.id and s.batch_number = stage_import_batch.batch_number;
    insert into catalog_import.card_printings
      select (jsonb_populate_record(
        null::catalog_import.card_printings,
        r || jsonb_build_object('run_id', run.id, 'batch_number', stage_import_batch.batch_number)
      )).*
      from jsonb_array_elements(stage_import_batch.batch_rows) r;
  else
    raise exception '% is not a staging target for % imports', stage_import_batch.target, run.source
      using errcode = 'invalid_parameter_value';
  end if;

  get diagnostics staged = row_count;
  return staged;
end;
$$;

create function public.finish_import_run(run_id uuid, staged_rows jsonb)
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
      values (run.source, run.source_updated_at, run.finished_at, run.id)
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

create function public.abort_import_run(run_id uuid, reason text)
returns public.import_runs
language plpgsql
security definer
set search_path = ''
as $$
declare
  run public.import_runs;
begin
  update public.import_runs r
    set status = 'failed',
      finished_at = now(),
      failure_reason = abort_import_run.reason
    where r.id = abort_import_run.run_id and r.status = 'running'
    returning * into run;
  if not found then
    raise exception 'Import run % is not open', abort_import_run.run_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform catalog_import.clear_staging(run.source);
  return run;
end;
$$;

create function public.catalog_storage_sizes()
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
    'public.import_runs',
    'public.import_snapshots'
  ]) as t(relation)
  union all
  select 'database', pg_database_size(current_database());
$$;

create function public.catalog_freshness()
returns table (
  source public.import_source,
  snapshot_at timestamptz,
  succeeded_at timestamptz,
  last_attempt_at timestamptz,
  last_attempt_status public.import_run_status,
  is_stale boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.source,
    snapshot.snapshot_at,
    snapshot.succeeded_at,
    last_attempt.started_at,
    last_attempt.status,
    snapshot.succeeded_at is null
      or snapshot.succeeded_at < now() - case s.source
        when 'prices' then interval '24 hours'
        else interval '7 days'
      end
  from unnest(enum_range(null::public.import_source)) as s(source)
  left join public.import_snapshots snapshot on snapshot.source = s.source
  left join lateral (
    select r.started_at, r.status
    from public.import_runs r
    where r.source = s.source
    order by r.started_at desc
    limit 1
  ) last_attempt on true
  order by s.source;
$$;

grant create on schema public to catalog_importer;

alter function catalog_import.clear_staging(public.import_source) owner to catalog_importer;
alter function catalog_import.check_staged_rows(uuid, text, jsonb, bigint, bigint) owner to catalog_importer;
alter function catalog_import.check_shrink(text, bigint, bigint, boolean) owner to catalog_importer;
alter function catalog_import.merge_catalog(public.import_runs, jsonb) owner to catalog_importer;
alter function public.begin_import_run(public.import_source, timestamptz, boolean) owner to catalog_importer;
alter function public.stage_import_batch(uuid, text, integer, jsonb) owner to catalog_importer;
alter function public.finish_import_run(uuid, jsonb) owner to catalog_importer;
alter function public.abort_import_run(uuid, text) owner to catalog_importer;
alter function public.catalog_storage_sizes() owner to catalog_importer;

revoke create on schema public from catalog_importer;

revoke all on function public.begin_import_run(public.import_source, timestamptz, boolean) from public, anon, authenticated;
revoke all on function public.stage_import_batch(uuid, text, integer, jsonb) from public, anon, authenticated;
revoke all on function public.finish_import_run(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.abort_import_run(uuid, text) from public, anon, authenticated;
revoke all on function public.catalog_storage_sizes() from public, anon, authenticated;
revoke all on function public.catalog_freshness() from public, anon;

grant execute on function public.begin_import_run(public.import_source, timestamptz, boolean) to service_role;
grant execute on function public.stage_import_batch(uuid, text, integer, jsonb) to service_role;
grant execute on function public.finish_import_run(uuid, jsonb) to service_role;
grant execute on function public.abort_import_run(uuid, text) to service_role;
grant execute on function public.catalog_storage_sizes() to service_role;
grant execute on function public.catalog_freshness() to authenticated, service_role;

alter role service_role set statement_timeout = '2min';

notify pgrst, 'reload config';

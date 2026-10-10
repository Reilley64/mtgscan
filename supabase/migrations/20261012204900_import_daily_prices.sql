create type public.price_currency as enum ('USD', 'EUR');

create table public.card_prices (
  printing_id uuid primary key references public.card_printings (id),
  usd_nonfoil_cents integer check (usd_nonfoil_cents >= 0),
  usd_foil_cents integer check (usd_foil_cents >= 0),
  usd_etched_cents integer check (usd_etched_cents >= 0),
  eur_nonfoil_cents integer check (eur_nonfoil_cents >= 0),
  eur_foil_cents integer check (eur_foil_cents >= 0),
  check (num_nonnulls(usd_nonfoil_cents, usd_foil_cents, usd_etched_cents, eur_nonfoil_cents, eur_foil_cents) > 0)
);

create table public.card_lowest_prices (
  oracle_id uuid not null references public.cards (oracle_id),
  currency public.price_currency not null,
  amount_cents integer not null check (amount_cents >= 0),
  finish public.card_finish not null,
  primary key (oracle_id, currency)
);

create index card_lowest_prices_currency_amount on public.card_lowest_prices (currency, amount_cents);

alter table public.card_prices enable row level security;
alter table public.card_lowest_prices enable row level security;

revoke all on table public.card_prices, public.card_lowest_prices from anon, authenticated;
grant select on table public.card_prices, public.card_lowest_prices to authenticated;

create policy "Signed-in users read card prices"
  on public.card_prices
  for select
  to authenticated
  using (true);

create policy "Signed-in users read lowest card prices"
  on public.card_lowest_prices
  for select
  to authenticated
  using (true);

grant select, insert, update, delete on table public.card_prices, public.card_lowest_prices to catalog_importer;

create policy "The import role writes card prices"
  on public.card_prices
  for all
  to catalog_importer
  using (true)
  with check (true);

create policy "The import role writes lowest card prices"
  on public.card_lowest_prices
  for all
  to catalog_importer
  using (true)
  with check (true);

grant select (created_at), delete on table public.search_telemetry to catalog_importer;

create policy "The import role reads telemetry older than 180 days"
  on public.search_telemetry
  for select
  to catalog_importer
  using (created_at < now() - interval '180 days');

create policy "The import role deletes telemetry older than 180 days"
  on public.search_telemetry
  for delete
  to catalog_importer
  using (created_at < now() - interval '180 days');

create unlogged table catalog_import.card_prices (
  run_id uuid not null,
  batch_number integer not null,
  printing_id uuid,
  usd_nonfoil_cents integer,
  usd_foil_cents integer,
  usd_etched_cents integer,
  eur_nonfoil_cents integer,
  eur_foil_cents integer
);

create index card_prices_run_batch on catalog_import.card_prices (run_id, batch_number);

alter table catalog_import.card_prices owner to catalog_importer;

create function catalog_import.staging_tables(source public.import_source)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case staging_tables.source
    when 'catalog' then array['cards', 'card_faces', 'card_printings']
    when 'prices' then array['card_prices']
    else array[]::text[]
  end;
$$;

create or replace function catalog_import.clear_staging(source public.import_source)
returns void
language plpgsql
set search_path = ''
as $$
declare
  staging_table text;
begin
  foreach staging_table in array catalog_import.staging_tables(clear_staging.source) loop
    execute format('truncate catalog_import.%I', staging_table);
  end loop;
end;
$$;

create function catalog_import.current_lowest_prices()
returns table (
  oracle_id uuid,
  currency public.price_currency,
  amount_cents integer,
  finish public.card_finish
)
language sql
stable
set search_path = ''
as $$
  select distinct on (printing.oracle_id, offer.currency)
    printing.oracle_id, offer.currency, offer.amount_cents, offer.finish
  from public.card_prices price
  join public.card_printings printing on printing.id = price.printing_id and printing.absent_since is null
  cross join lateral (
    values
      ('USD'::public.price_currency, 'nonfoil'::public.card_finish, price.usd_nonfoil_cents),
      ('USD', 'foil', price.usd_foil_cents),
      ('USD', 'etched', price.usd_etched_cents),
      ('EUR', 'nonfoil', price.eur_nonfoil_cents),
      ('EUR', 'foil', price.eur_foil_cents)
  ) as offer(currency, finish, amount_cents)
  where offer.amount_cents is not null
  order by printing.oracle_id, offer.currency, offer.amount_cents, offer.finish;
$$;

create function catalog_import.merge_prices(run public.import_runs, staged_rows jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  staged_prices bigint;
  missing bigint;
  dropped_prices bigint;
  accepted_prices bigint;
  prices_inserted bigint;
  prices_updated bigint;
  prices_deleted bigint;
  lowest_inserted bigint;
  lowest_updated bigint;
  lowest_deleted bigint;
begin
  select count(*), count(*) filter (
      where p.printing_id is null
        or num_nonnulls(p.usd_nonfoil_cents, p.usd_foil_cents, p.usd_etched_cents, p.eur_nonfoil_cents,
          p.eur_foil_cents) = 0
    )
    into staged_prices, missing
    from catalog_import.card_prices p
    where p.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'card_prices', staged_rows -> 'card_prices', staged_prices, missing);

  delete from catalog_import.card_prices p
    where p.run_id = run.id
      and not exists (select 1 from public.card_printings printing where printing.id = p.printing_id);
  get diagnostics dropped_prices = row_count;
  accepted_prices := staged_prices - dropped_prices;

  perform catalog_import.check_shrink(
    'card_prices',
    (select count(*) from public.card_prices),
    accepted_prices,
    run.accept_shrink
  );

  with merged as (
    insert into public.card_prices as live (
      printing_id, usd_nonfoil_cents, usd_foil_cents, usd_etched_cents, eur_nonfoil_cents, eur_foil_cents
    )
    select p.printing_id, p.usd_nonfoil_cents, p.usd_foil_cents, p.usd_etched_cents, p.eur_nonfoil_cents,
      p.eur_foil_cents
    from catalog_import.card_prices p
    where p.run_id = run.id
    on conflict (printing_id) do update set
      usd_nonfoil_cents = excluded.usd_nonfoil_cents,
      usd_foil_cents = excluded.usd_foil_cents,
      usd_etched_cents = excluded.usd_etched_cents,
      eur_nonfoil_cents = excluded.eur_nonfoil_cents,
      eur_foil_cents = excluded.eur_foil_cents
    where (
      live.usd_nonfoil_cents, live.usd_foil_cents, live.usd_etched_cents, live.eur_nonfoil_cents,
      live.eur_foil_cents
    ) is distinct from (
      excluded.usd_nonfoil_cents, excluded.usd_foil_cents, excluded.usd_etched_cents,
      excluded.eur_nonfoil_cents, excluded.eur_foil_cents
    )
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into prices_inserted, prices_updated
    from merged;

  delete from public.card_prices live
    where not exists (
      select 1 from catalog_import.card_prices p where p.run_id = run.id and p.printing_id = live.printing_id
    );
  get diagnostics prices_deleted = row_count;

  delete from public.card_lowest_prices live
    where not exists (
      select 1
      from catalog_import.current_lowest_prices() lowest
      where lowest.oracle_id = live.oracle_id and lowest.currency = live.currency
    );
  get diagnostics lowest_deleted = row_count;

  with merged as (
    insert into public.card_lowest_prices as live (oracle_id, currency, amount_cents, finish)
    select lowest.oracle_id, lowest.currency, lowest.amount_cents, lowest.finish
    from catalog_import.current_lowest_prices() lowest
    on conflict (oracle_id, currency) do update set
      amount_cents = excluded.amount_cents,
      finish = excluded.finish
    where (live.amount_cents, live.finish) is distinct from (excluded.amount_cents, excluded.finish)
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into lowest_inserted, lowest_updated
    from merged;

  return jsonb_build_object(
    'card_prices', jsonb_build_object(
      'staged', staged_prices,
      'accepted', accepted_prices,
      'dropped', dropped_prices,
      'inserted', prices_inserted,
      'updated', prices_updated,
      'deleted', prices_deleted
    ),
    'card_lowest_prices', jsonb_build_object(
      'inserted', lowest_inserted,
      'updated', lowest_updated,
      'deleted', lowest_deleted
    )
  );
end;
$$;

create or replace function public.begin_import_run(
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
  last_good_source_updated_at timestamptz;
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

  select good_run.source_updated_at into last_good_source_updated_at
    from public.import_snapshots s
    join public.import_runs good_run on good_run.id = s.run_id
    where s.source = begin_import_run.source;

  if last_good_source_updated_at is not null
    and begin_import_run.source_updated_at <= last_good_source_updated_at then
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

create or replace function public.stage_import_batch(
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

  if not stage_import_batch.target = any (catalog_import.staging_tables(run.source)) then
    raise exception '% is not a staging target for % imports', stage_import_batch.target, run.source
      using errcode = 'invalid_parameter_value';
  end if;

  execute format('delete from catalog_import.%I s where s.run_id = $1 and s.batch_number = $2', stage_import_batch.target)
    using run.id, stage_import_batch.batch_number;
  execute format(
    'insert into catalog_import.%1$I '
    'select (jsonb_populate_record(null::catalog_import.%1$I, r || jsonb_build_object(''run_id'', $1, ''batch_number'', $2))).* '
    'from jsonb_array_elements($3) r',
    stage_import_batch.target
  )
    using run.id, stage_import_batch.batch_number, stage_import_batch.batch_rows;

  get diagnostics staged = row_count;
  return staged;
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
    'public.import_runs',
    'public.import_snapshots'
  ]) as t(relation)
  union all
  select 'database', pg_database_size(current_database());
$$;

create function public.prune_search_telemetry()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  pruned bigint;
begin
  delete from public.search_telemetry t where t.created_at < now() - interval '180 days';
  get diagnostics pruned = row_count;
  return pruned;
end;
$$;

grant create on schema public to catalog_importer;

alter function catalog_import.staging_tables(public.import_source) owner to catalog_importer;
alter function catalog_import.current_lowest_prices() owner to catalog_importer;
alter function catalog_import.merge_prices(public.import_runs, jsonb) owner to catalog_importer;
alter function public.prune_search_telemetry() owner to catalog_importer;

revoke create on schema public from catalog_importer;

revoke all on function public.prune_search_telemetry() from public, anon, authenticated;
grant execute on function public.prune_search_telemetry() to service_role;

create function private.checked_price(field text, value jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(value) is distinct from 'string' or (value #>> '{}') !~ '^[0-9]{1,6}(\.[0-9]{1,2})?$' then
    perform private.invalid_argument(
      field,
      format('%s must be a decimal amount from 0 to 999999.99 as a string, such as "4.99".', field)
    );
  end if;
  return value;
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
      if field in ('tags', 'tags_exclude') then
        perform private.invalid_argument(field, format('%s is not available yet.', field));
      elsif field = 'cursor' then
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
      'and lp.currency = %L and lp.amount_cents between %s and %s)',
      checked ->> 'price_currency',
      coalesce(round((checked ->> 'price_min')::numeric * 100), 0),
      coalesce(round((checked ->> 'price_max')::numeric * 100), 99999999)
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

create function private.price_from(oracle_id uuid, currency public.price_currency)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'currency', lowest.currency,
    'amount', (lowest.amount_cents / 100.0)::numeric(10, 2)::text,
    'finish', lowest.finish,
    'basis', 'lowest current price over printings and finishes'
  )
  from public.card_lowest_prices lowest
  where lowest.oracle_id = price_from.oracle_id and lowest.currency = price_from.currency;
$$;

revoke all on function private.price_from(uuid, public.price_currency) from public;

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

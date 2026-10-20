CREATE OR REPLACE FUNCTION catalog_import.merge_exchange_rates (
  run         public.import_runs,
  staged_rows jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
$function$;

GRANT EXECUTE ON FUNCTION "catalog_import"."merge_exchange_rates"(public.import_runs, jsonb) TO PUBLIC;

REVOKE ALL ON FUNCTION "catalog_import"."merge_exchange_rates"(public.import_runs, jsonb) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "catalog_import"."merge_exchange_rates"(public.import_runs, jsonb) TO "catalog_importer";

ALTER FUNCTION "catalog_import"."merge_exchange_rates"(public.import_runs, jsonb) OWNER TO "catalog_importer";

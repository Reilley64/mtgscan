CREATE OR REPLACE FUNCTION catalog_import.merge_prices (
  run         public.import_runs,
  staged_rows jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
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
        or num_nonnulls(p.usd_nonfoil_cents, p.usd_foil_cents, p.usd_etched_cents) = 0
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
    insert into public.card_prices as live (printing_id, usd_nonfoil_cents, usd_foil_cents, usd_etched_cents)
    select p.printing_id, p.usd_nonfoil_cents, p.usd_foil_cents, p.usd_etched_cents
    from catalog_import.card_prices p
    where p.run_id = run.id
    on conflict (printing_id) do update set
      usd_nonfoil_cents = excluded.usd_nonfoil_cents,
      usd_foil_cents = excluded.usd_foil_cents,
      usd_etched_cents = excluded.usd_etched_cents
    where (live.usd_nonfoil_cents, live.usd_foil_cents, live.usd_etched_cents)
      is distinct from (excluded.usd_nonfoil_cents, excluded.usd_foil_cents, excluded.usd_etched_cents)
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
      where lowest.oracle_id = live.oracle_id
    );
  get diagnostics lowest_deleted = row_count;

  with merged as (
    insert into public.card_lowest_prices as live (oracle_id, usd_cents, finish)
    select lowest.oracle_id, lowest.usd_cents, lowest.finish
    from catalog_import.current_lowest_prices() lowest
    on conflict (oracle_id) do update set
      usd_cents = excluded.usd_cents,
      finish = excluded.finish
    where (live.usd_cents, live.finish) is distinct from (excluded.usd_cents, excluded.finish)
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
$function$;

GRANT EXECUTE ON FUNCTION "catalog_import"."merge_prices"(public.import_runs, jsonb) TO PUBLIC;

REVOKE ALL ON FUNCTION "catalog_import"."merge_prices"(public.import_runs, jsonb) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "catalog_import"."merge_prices"(public.import_runs, jsonb) TO "catalog_importer";

ALTER FUNCTION "catalog_import"."merge_prices"(public.import_runs, jsonb) OWNER TO "catalog_importer";

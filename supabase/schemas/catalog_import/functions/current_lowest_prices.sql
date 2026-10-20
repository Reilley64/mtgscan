CREATE OR REPLACE FUNCTION catalog_import.current_lowest_prices()
  RETURNS TABLE (
    oracle_id uuid,
    usd_cents integer,
    finish    public.card_finish
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select distinct on (printing.oracle_id)
    printing.oracle_id, offer.usd_cents, offer.finish
  from public.card_prices price
  join public.card_printings printing on printing.id = price.printing_id and printing.absent_since is null
  cross join lateral (
    values
      ('nonfoil'::public.card_finish, price.usd_nonfoil_cents),
      ('foil', price.usd_foil_cents),
      ('etched', price.usd_etched_cents)
  ) as offer(finish, usd_cents)
  where offer.usd_cents is not null
  order by printing.oracle_id, offer.usd_cents, offer.finish;
$function$;

GRANT EXECUTE ON FUNCTION "catalog_import"."current_lowest_prices"() TO PUBLIC;

REVOKE ALL ON FUNCTION "catalog_import"."current_lowest_prices"() FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "catalog_import"."current_lowest_prices"() TO "catalog_importer";

ALTER FUNCTION "catalog_import"."current_lowest_prices"() OWNER TO "catalog_importer";

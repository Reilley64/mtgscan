CREATE OR REPLACE FUNCTION private.catalog_filter_conditions (
  checked jsonb
)
  RETURNS text[]
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  conditions text[] := array['c.commander_legality = ''legal''', 'c.absent_since is null']
    || private.card_filter_conditions(checked)
    || private.printing_filter_conditions(
      checked,
      'exists (select 1 from public.card_printings p where p.oracle_id = c.oracle_id and p.absent_since is null and %s)'
    );
begin
  if checked ? 'price_min' or checked ? 'price_max' then
    conditions := conditions || format(
      'exists (select 1 from public.card_lowest_prices lp where lp.oracle_id = c.oracle_id and %s)',
      private.price_condition('lp.usd_cents', checked)
    );
  end if;

  return conditions;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."catalog_filter_conditions"(jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."catalog_filter_conditions"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."catalog_filter_conditions"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."catalog_filter_conditions"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."catalog_filter_conditions"(jsonb) TO "postgres";

CREATE OR REPLACE FUNCTION public.list_exchange_rates()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object('items', jsonb_agg(
    jsonb_build_object(
      'currency', offered.currency,
      'rate', offered.rate::text,
      'rate_date', offered.rate_date,
      'minor_unit_digits', private.minor_unit_digits(offered.currency)
    )
    order by offered.currency
  ))
  from (
    select 'USD' as currency, 1::numeric as rate, null::date as rate_date
    union all
    select r.currency, r.rate, r.rate_date from public.exchange_rates r where r.currency <> 'USD'
  ) offered;
$function$;

GRANT EXECUTE ON FUNCTION "public"."list_exchange_rates"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_exchange_rates"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_exchange_rates"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_exchange_rates"() FROM PUBLIC, "anon", "service_role";

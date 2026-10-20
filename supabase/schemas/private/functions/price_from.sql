CREATE OR REPLACE FUNCTION private.price_from (
  oracle_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.price_json(lowest.usd_cents, lowest.finish)
    || jsonb_build_object('basis', 'lowest current price over printings and finishes')
  from public.card_lowest_prices lowest
  where lowest.oracle_id = price_from.oracle_id;
$function$;

GRANT EXECUTE ON FUNCTION "private"."price_from"(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."price_from"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "private"."price_from"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."price_from"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."price_from"(uuid) TO "postgres";

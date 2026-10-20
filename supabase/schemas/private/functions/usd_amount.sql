CREATE OR REPLACE FUNCTION private.usd_amount (
  usd_cents bigint
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select round(usd_cents / 100.0, 2)::text;
$function$;

GRANT EXECUTE ON FUNCTION "private"."usd_amount"(bigint) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."usd_amount"(bigint) TO "service_role";

REVOKE ALL ON FUNCTION "private"."usd_amount"(bigint) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."usd_amount"(bigint) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."usd_amount"(bigint) TO "postgres";

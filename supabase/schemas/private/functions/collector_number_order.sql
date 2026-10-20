CREATE OR REPLACE FUNCTION private.collector_number_order (
  collector_number text
)
  RETURNS private.collector_number_order
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select ((substring(collector_number from '^[0-9]+'))::numeric, collector_number)::private.collector_number_order;
$function$;

GRANT EXECUTE ON FUNCTION "private"."collector_number_order"(text) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."collector_number_order"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."collector_number_order"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."collector_number_order"(text) TO "postgres";

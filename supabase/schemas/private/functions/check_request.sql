CREATE OR REPLACE FUNCTION private.check_request (
  request jsonb,
  fields  text[]
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.checked_object(null, request, fields, '{}');
$function$;

GRANT EXECUTE ON FUNCTION "private"."check_request"(jsonb, text[]) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."check_request"(jsonb, text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."check_request"(jsonb, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."check_request"(jsonb, text[]) TO "postgres";

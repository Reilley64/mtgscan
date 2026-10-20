CREATE OR REPLACE FUNCTION private.caller_uses_secret_key()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select coalesce(auth.jwt() ->> 'role' = 'service_role', false);
$function$;

GRANT EXECUTE ON FUNCTION "private"."caller_uses_secret_key"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."caller_uses_secret_key"() TO "service_role";

REVOKE ALL ON FUNCTION "private"."caller_uses_secret_key"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."caller_uses_secret_key"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."caller_uses_secret_key"() TO "postgres";

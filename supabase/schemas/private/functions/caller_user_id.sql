CREATE OR REPLACE FUNCTION private.caller_user_id()
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'A signed-in user must call this function.' using errcode = 'insufficient_privilege';
  end if;
  return caller;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."caller_user_id"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."caller_user_id"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."caller_user_id"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."caller_user_id"() TO "postgres";

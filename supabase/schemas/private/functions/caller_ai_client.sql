CREATE OR REPLACE FUNCTION private.caller_ai_client()
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  if auth.jwt() ->> 'client_id' is null then
    raise exception 'Only an AI client can call this function.' using errcode = 'insufficient_privilege';
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."caller_ai_client"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."caller_ai_client"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."caller_ai_client"() TO "postgres";

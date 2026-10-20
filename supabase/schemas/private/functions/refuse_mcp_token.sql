CREATE OR REPLACE FUNCTION private.refuse_mcp_token()
  RETURNS void
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  if auth.jwt() ->> 'client_id' is not null then
    raise exception 'AI clients cannot change decks or the collection.' using errcode = 'insufficient_privilege';
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."refuse_mcp_token"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."refuse_mcp_token"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."refuse_mcp_token"() TO "postgres";

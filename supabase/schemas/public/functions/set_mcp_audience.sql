CREATE OR REPLACE FUNCTION public.set_mcp_audience (
  event jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case
    when event -> 'claims' ->> 'client_id' is null then event
    else jsonb_set(
      event,
      '{claims,aud}',
      jsonb_build_array('authenticated', regexp_replace(event -> 'claims' ->> 'iss', '/auth/v1$', '/functions/v1/mcp'))
    )
  end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_mcp_audience"(jsonb) TO "supabase_auth_admin";

REVOKE ALL ON FUNCTION "public"."set_mcp_audience"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_mcp_audience"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_mcp_audience"(jsonb) FROM PUBLIC, "anon", "authenticated", "service_role";

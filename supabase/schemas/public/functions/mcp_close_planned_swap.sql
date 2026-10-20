CREATE OR REPLACE FUNCTION public.mcp_close_planned_swap (
  request jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  return private.closed_planned_swap(caller, request, 'closed_by_ai_client');
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."mcp_close_planned_swap"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."mcp_close_planned_swap"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mcp_close_planned_swap"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mcp_close_planned_swap"(jsonb) FROM PUBLIC, "anon", "service_role";

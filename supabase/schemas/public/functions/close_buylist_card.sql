CREATE OR REPLACE FUNCTION public.close_buylist_card (
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
  perform private.refuse_mcp_token();
  return private.closed_buylist_card(caller, request, 'closed_by_user');
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."close_buylist_card"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."close_buylist_card"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."close_buylist_card"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."close_buylist_card"(jsonb) FROM PUBLIC, "anon", "service_role";

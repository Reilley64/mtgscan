CREATE OR REPLACE FUNCTION public.mcp_rename_user_tag (
  request jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['user_tag_id', 'name']);

  return private.rename_user_tag(caller, (checked ->> 'user_tag_id')::uuid, checked ->> 'name');
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."mcp_rename_user_tag"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."mcp_rename_user_tag"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mcp_rename_user_tag"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mcp_rename_user_tag"(jsonb) FROM PUBLIC, "anon", "service_role";

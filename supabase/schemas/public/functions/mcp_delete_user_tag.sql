CREATE OR REPLACE FUNCTION public.mcp_delete_user_tag (
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
  chosen_user_tag_id uuid;
  changed boolean;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['user_tag_id']);
  chosen_user_tag_id := (checked ->> 'user_tag_id')::uuid;

  changed := private.delete_user_tag(caller, chosen_user_tag_id);
  return jsonb_build_object(
    'user_tag_id', chosen_user_tag_id,
    'changed', changed,
    'copy_count', case when changed then private.user_tag_copy_count(caller, chosen_user_tag_id) else 0 end
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."mcp_delete_user_tag"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."mcp_delete_user_tag"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mcp_delete_user_tag"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mcp_delete_user_tag"(jsonb) FROM PUBLIC, "anon", "service_role";

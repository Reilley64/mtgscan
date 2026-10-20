CREATE OR REPLACE FUNCTION public.delete_user_tag (
  request jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['user_tag_id']);

  if not private.delete_user_tag(caller, (checked ->> 'user_tag_id')::uuid) then
    perform private.raise_user_tag_not_found();
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."delete_user_tag"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."delete_user_tag"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_user_tag"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."delete_user_tag"(jsonb) FROM PUBLIC, "anon", "service_role";

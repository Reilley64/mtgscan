CREATE OR REPLACE FUNCTION public.create_user_tag (
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
  created jsonb;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['name']);

  created := private.create_user_tag(caller, checked ->> 'name');
  if not (created ->> 'created')::boolean then
    perform private.raise_user_tag_exists();
  end if;
  return created - 'created';
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_user_tag"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."create_user_tag"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_user_tag"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_user_tag"(jsonb) FROM PUBLIC, "anon", "service_role";

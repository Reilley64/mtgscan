CREATE OR REPLACE FUNCTION public.set_copy_user_tag (
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
  chosen_copy_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  chosen_copy_id := private.checked_copy_id(request, array['user_tag_id', 'tagged']);
  checked := private.check_request(request - 'copy_id', array['user_tag_id', 'tagged']);

  if cardinality(private.set_copies_user_tag(
    caller,
    (checked ->> 'user_tag_id')::uuid,
    array[chosen_copy_id],
    (checked ->> 'tagged')::boolean
  )) = 0 then
    perform private.raise_copy_not_found();
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_copy_user_tag"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_copy_user_tag"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_copy_user_tag"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_copy_user_tag"(jsonb) FROM PUBLIC, "anon", "service_role";

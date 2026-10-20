CREATE OR REPLACE FUNCTION public.mcp_restore_user_tag (
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
  user_tag public.user_tags;
  changed boolean;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['user_tag_id']);

  begin
    update public.user_tags restored
      set deleted_at = null
      where restored.user_id = caller and restored.id = (checked ->> 'user_tag_id')::uuid and restored.deleted_at is not null
      returning * into user_tag;
  exception when unique_violation then
    perform private.raise_search_error(
      'user_tag_exists',
      'You already have another user tag with the name of this user tag.',
      'user_tag_id'
    );
  end;
  changed := user_tag.id is not null;
  if not changed then
    select * into user_tag
      from public.user_tags existing
      where existing.user_id = caller and existing.id = (checked ->> 'user_tag_id')::uuid;
    if user_tag.id is null then
      perform private.raise_user_tag_not_found();
    end if;
  end if;

  return jsonb_build_object(
    'user_tag_id', user_tag.id,
    'name', user_tag.name,
    'changed', changed,
    'copy_count', private.user_tag_copy_count(caller, user_tag.id)
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."mcp_restore_user_tag"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."mcp_restore_user_tag"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mcp_restore_user_tag"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mcp_restore_user_tag"(jsonb) FROM PUBLIC, "anon", "service_role";

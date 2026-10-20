CREATE OR REPLACE FUNCTION public.list_user_tags (
  query jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb;
begin
  perform private.caller_user_id();
  checked := private.checked_object(null, query, '{}', array['deleted']);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_tag_id', user_tag.id,
        'name', user_tag.name,
        'copy_count', private.user_tag_copy_count(user_tag.user_id, user_tag.id)
      )
      order by lower(user_tag.name), user_tag.name, user_tag.id
    )
    from public.user_tags user_tag
    where (user_tag.deleted_at is not null) = coalesce((checked ->> 'deleted')::boolean, false)
  ), '[]'::jsonb));
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."list_user_tags"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_user_tags"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_user_tags"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_user_tags"(jsonb) FROM PUBLIC, "anon", "service_role";

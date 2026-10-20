CREATE OR REPLACE FUNCTION private.user_tag_copy_count (
  owner_id           uuid,
  chosen_user_tag_id uuid
)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select count(*)
  from public.copy_user_tags link
  where link.user_id = owner_id and link.user_tag_id = chosen_user_tag_id and link.deleted_at is null;
$function$;

GRANT EXECUTE ON FUNCTION "private"."user_tag_copy_count"(uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."user_tag_copy_count"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."user_tag_copy_count"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."user_tag_copy_count"(uuid, uuid) TO "postgres";

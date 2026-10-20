CREATE OR REPLACE FUNCTION private.delete_user_tag (
  owner_id           uuid,
  chosen_user_tag_id uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  update public.user_tags user_tag
    set deleted_at = now()
    where user_tag.user_id = owner_id and user_tag.id = chosen_user_tag_id and user_tag.deleted_at is null;
  if found then
    return true;
  end if;

  if not exists (
    select 1 from public.user_tags user_tag where user_tag.user_id = owner_id and user_tag.id = chosen_user_tag_id
  ) then
    perform private.raise_user_tag_not_found();
  end if;
  return false;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."delete_user_tag"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."delete_user_tag"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."delete_user_tag"(uuid, uuid) TO "postgres";

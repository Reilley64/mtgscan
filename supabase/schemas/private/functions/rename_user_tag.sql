CREATE OR REPLACE FUNCTION private.rename_user_tag (
  owner_id           uuid,
  chosen_user_tag_id uuid,
  chosen_name        text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  renamed public.user_tags;
begin
  begin
    update public.user_tags user_tag
      set name = chosen_name
      where user_tag.user_id = owner_id and user_tag.id = chosen_user_tag_id and user_tag.deleted_at is null
      returning * into renamed;
  exception when unique_violation then
    perform private.raise_user_tag_exists();
  end;
  if renamed.id is null then
    perform private.raise_user_tag_not_found();
  end if;

  return jsonb_build_object('user_tag_id', renamed.id, 'name', renamed.name);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."rename_user_tag"(uuid, uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."rename_user_tag"(uuid, uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."rename_user_tag"(uuid, uuid, text) TO "postgres";

CREATE OR REPLACE FUNCTION private.create_user_tag (
  owner_id    uuid,
  chosen_name text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  user_tag public.user_tags;
begin
  insert into public.user_tags (user_id, name)
    values (owner_id, chosen_name)
    on conflict (user_id, lower(name)) where deleted_at is null do nothing
    returning * into user_tag;
  if user_tag.id is not null then
    return jsonb_build_object('user_tag_id', user_tag.id, 'name', user_tag.name, 'created', true);
  end if;

  select * into user_tag
    from public.user_tags existing
    where existing.user_id = owner_id and lower(existing.name) = lower(chosen_name) and existing.deleted_at is null;
  return jsonb_build_object('user_tag_id', user_tag.id, 'name', user_tag.name, 'created', false);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."create_user_tag"(uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."create_user_tag"(uuid, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."create_user_tag"(uuid, text) TO "postgres";

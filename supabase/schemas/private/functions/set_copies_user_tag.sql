CREATE OR REPLACE FUNCTION private.set_copies_user_tag (
  owner_id           uuid,
  chosen_user_tag_id uuid,
  chosen_copy_ids    uuid[],
  tagged             boolean
)
  RETURNS uuid[]
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  found_copy_ids uuid[];
begin
  perform 1
    from public.user_tags user_tag
    where user_tag.user_id = owner_id and user_tag.id = chosen_user_tag_id and user_tag.deleted_at is null
    for share;
  if not found then
    perform private.raise_user_tag_not_found();
  end if;

  found_copy_ids := array(
    select copy.id
    from public.copies copy
    where copy.user_id = owner_id and copy.id = any (chosen_copy_ids)
    order by copy.id
    for key share
  );

  if tagged then
    insert into public.copy_user_tags (user_id, copy_id, user_tag_id)
      select owner_id, found.copy_id, chosen_user_tag_id from unnest(found_copy_ids) found(copy_id)
      on conflict (user_id, copy_id, user_tag_id) do update
        set deleted_at = null
        where public.copy_user_tags.deleted_at is not null;
  else
    update public.copy_user_tags link
      set deleted_at = now()
      where link.user_id = owner_id
        and link.user_tag_id = chosen_user_tag_id
        and link.copy_id = any (found_copy_ids)
        and link.deleted_at is null;
  end if;
  return found_copy_ids;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."set_copies_user_tag"(uuid, uuid, uuid[], boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."set_copies_user_tag"(uuid, uuid, uuid[], boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."set_copies_user_tag"(uuid, uuid, uuid[], boolean) TO "postgres";

CREATE OR REPLACE FUNCTION private.reverted_revision (
  owner_id       uuid,
  chosen_deck_id uuid,
  change_id      uuid
)
  RETURNS integer
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  found_revision integer;
begin
  select change.revision into found_revision
    from public.deck_changes change
    where change.user_id = owner_id and change.deck_id = chosen_deck_id and change.id = change_id;
  if found_revision is null then
    perform private.raise_deck_change_not_found();
  end if;
  return found_revision;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."reverted_revision"(uuid, uuid, uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."reverted_revision"(uuid, uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."reverted_revision"(uuid, uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."reverted_revision"(uuid, uuid, uuid) TO "postgres";

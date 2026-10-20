CREATE OR REPLACE FUNCTION private.take_free_copy (
  owner_id    uuid,
  chosen_copy public.copies,
  unprotect   boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if not (select a.is_free from private.collection_availability a where a.user_id = owner_id and a.copy_id = chosen_copy.id) then
    perform private.raise_search_error('copy_not_free', 'Only a free copy can go into a deck.', 'copy_id');
  end if;
  if chosen_copy.is_protected then
    if not unprotect then
      perform private.raise_search_error(
        'protected_copy',
        'copy_id is a protected copy. Send unprotect: true to unprotect it and put it in the deck.',
        'copy_id'
      );
    end if;
    update public.copies copy set is_protected = false where copy.user_id = owner_id and copy.id = chosen_copy.id;
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."take_free_copy"(uuid, public.copies, boolean) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."take_free_copy"(uuid, public.copies, boolean) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."take_free_copy"(uuid, public.copies, boolean) TO "postgres";

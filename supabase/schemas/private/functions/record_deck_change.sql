CREATE OR REPLACE FUNCTION private.record_deck_change (
  caller         uuid,
  chosen_deck_id uuid,
  change_kind    public.deck_change_kind
)
  RETURNS uuid
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  new_revision integer;
  change_id uuid;
begin
  update public.decks deck
    set revision = deck.revision + 1, last_used_at = now()
    where deck.user_id = caller and deck.id = chosen_deck_id
    returning deck.revision into new_revision;

  insert into public.deck_changes (user_id, deck_id, revision, kind)
    values (caller, chosen_deck_id, new_revision, change_kind)
    returning id into change_id;
  return change_id;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."record_deck_change"(uuid, uuid, public.deck_change_kind) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."record_deck_change"(uuid, uuid, public.deck_change_kind) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."record_deck_change"(uuid, uuid, public.deck_change_kind) TO "postgres";

CREATE OR REPLACE FUNCTION private.lock_deck (
  caller         uuid,
  chosen_deck_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  perform 1 from public.decks deck where deck.user_id = caller and deck.id = chosen_deck_id for update;
  if not found then
    perform private.raise_deck_not_found();
  end if;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."lock_deck"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."lock_deck"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."lock_deck"(uuid, uuid) TO "postgres";

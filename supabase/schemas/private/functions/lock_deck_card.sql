CREATE OR REPLACE FUNCTION private.lock_deck_card (
  caller         uuid,
  chosen_copy_id uuid
)
  RETURNS public.deck_cards
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  found_card public.deck_cards;
begin
  perform 1 from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id;
  if not found then
    perform private.raise_copy_not_found();
  end if;

  found_card := private.lock_deck_of_copy(caller, chosen_copy_id);
  if found_card.copy_id is null then
    perform private.raise_search_error('copy_not_in_deck', 'copy_id is not in a deck.', 'copy_id');
  end if;
  return found_card;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."lock_deck_card"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."lock_deck_card"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."lock_deck_card"(uuid, uuid) TO "postgres";

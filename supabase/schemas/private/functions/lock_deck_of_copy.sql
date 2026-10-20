CREATE OR REPLACE FUNCTION private.lock_deck_of_copy (
  caller         uuid,
  chosen_copy_id uuid
)
  RETURNS public.deck_cards
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  locked_deck_id uuid;
  found_card public.deck_cards;
begin
  loop
    select card.deck_id into locked_deck_id
      from public.deck_cards card
      where card.user_id = caller and card.copy_id = chosen_copy_id;
    perform 1 from public.decks deck where deck.user_id = caller and deck.id = locked_deck_id for update;
    perform 1 from public.copies copy where copy.user_id = caller and copy.id = chosen_copy_id for update;
    select * into found_card
      from public.deck_cards card
      where card.user_id = caller and card.copy_id = chosen_copy_id;
    exit when found_card.deck_id is not distinct from locked_deck_id;
  end loop;
  return found_card;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."lock_deck_of_copy"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."lock_deck_of_copy"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."lock_deck_of_copy"(uuid, uuid) TO "postgres";

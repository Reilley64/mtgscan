CREATE OR REPLACE FUNCTION private.remove_from_deck (
  caller      uuid,
  deck_card   public.deck_cards,
  change_kind public.deck_change_kind
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  chosen_copy public.copies;
  change_id uuid;
begin
  delete from public.deck_cards card where card.user_id = caller and card.copy_id = deck_card.copy_id;
  select * into chosen_copy from public.copies copy where copy.user_id = caller and copy.id = deck_card.copy_id;

  change_id := private.record_deck_change(caller, deck_card.deck_id, change_kind);
  insert into public.deck_change_lines (user_id, deck_change_id, copy_id, card_printing_id, finish, place_before, place_after)
    values (
      caller,
      change_id,
      chosen_copy.id,
      chosen_copy.card_printing_id,
      chosen_copy.finish,
      private.deck_role(deck_card.commander_at),
      null
    );
  perform private.finish_deck_change(caller, deck_card.deck_id);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."remove_from_deck"(uuid, public.deck_cards, public.deck_change_kind) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."remove_from_deck"(uuid, public.deck_cards, public.deck_change_kind) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."remove_from_deck"(uuid, public.deck_cards, public.deck_change_kind) TO "postgres";

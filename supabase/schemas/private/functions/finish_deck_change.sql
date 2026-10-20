CREATE OR REPLACE FUNCTION private.finish_deck_change (
  owner_id       uuid,
  chosen_deck_id uuid
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  update public.planned_swaps swap
    set status = 'closed', close_note = 'outgoing_left_deck', status_changed_at = now()
    where swap.user_id = owner_id
      and swap.deck_id = chosen_deck_id
      and swap.status = 'open'
      and not private.outgoing_card_is_in_deck(owner_id, chosen_deck_id, swap.outgoing_copy_id, swap.outgoing_oracle_id);
  update public.buylist_cards card
    set status = 'closed', close_note = 'outgoing_left_deck', status_changed_at = now()
    where card.user_id = owner_id
      and card.deck_id = chosen_deck_id
      and card.status = 'open'
      and not private.outgoing_card_is_in_deck(owner_id, chosen_deck_id, card.outgoing_copy_id, card.outgoing_oracle_id);
  perform private.save_deck_evaluation(owner_id, chosen_deck_id);
end;
$function$;

REVOKE ALL ON FUNCTION "private"."finish_deck_change"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."finish_deck_change"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."finish_deck_change"(uuid, uuid) TO "postgres";

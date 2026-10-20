CREATE OR REPLACE FUNCTION public.mark_buylist_card_bought (
  request jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  checked jsonb;
  card public.buylist_cards;
  chosen_copy public.copies;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['buylist_card_id', 'copy_id', 'unprotect']);
  card := private.locked_buylist_card(caller, (checked ->> 'buylist_card_id')::uuid, array['open']::public.buylist_card_status[]);
  select * into chosen_copy
    from public.copies copy
    where copy.user_id = caller and copy.id = (checked ->> 'copy_id')::uuid
    for update;
  if chosen_copy.id is null then
    perform private.raise_copy_not_found();
  end if;

  if (select printing.oracle_id from public.card_printings printing where printing.id = chosen_copy.card_printing_id)
    <> card.incoming_oracle_id then
    perform private.invalid_argument('copy_id', 'copy_id is not a copy of the card on the buylist card.');
  end if;
  perform private.take_free_copy(caller, chosen_copy, (checked ->> 'unprotect')::boolean);

  perform private.swap_into_deck(
    caller,
    card.deck_id,
    chosen_copy,
    card.incoming_oracle_id,
    card.as_commander,
    card.outgoing_copy_id,
    card.outgoing_oracle_id,
    'bought',
    card.reason,
    'buylist_card_id'
  );
  update public.buylist_cards bought
    set status = 'bought', status_changed_at = now()
    where bought.user_id = caller and bought.id = card.id;
  perform private.finish_deck_change(caller, card.deck_id);

  return jsonb_build_object(
    'deck_id', card.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = card.deck_id)
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."mark_buylist_card_bought"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."mark_buylist_card_bought"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mark_buylist_card_bought"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mark_buylist_card_bought"(jsonb) FROM PUBLIC, "anon", "service_role";

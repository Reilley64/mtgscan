CREATE OR REPLACE FUNCTION public.create_buylist_cards (
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
  replayed jsonb;
  cards private.new_buylist_card[] := '{}';
  item_index integer;
  result jsonb;
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['idempotency_key', 'buylist_cards']);
  replayed := private.replayed_ai_write(caller, request);
  if replayed is not null then
    return replayed;
  end if;

  perform 1
    from public.decks locked_deck
    where locked_deck.user_id = caller
      and locked_deck.id in (select (item ->> 'deck_id')::uuid from jsonb_array_elements(checked -> 'buylist_cards') item)
    order by locked_deck.id
    for update;

  for item_index in 0 .. jsonb_array_length(checked -> 'buylist_cards') - 1 loop
    cards := cards || private.resolved_buylist_card(caller, item_index, checked -> 'buylist_cards' -> item_index);
  end loop;
  perform private.check_duplicate_plans(caller, 'buylist_cards', (select jsonb_agg(to_jsonb(card)) from unnest(cards) card));

  result := jsonb_build_object(
    'buylist_cards', (
      select jsonb_agg(
        jsonb_build_object(
          'ref', card.ref,
          'buylist_card_id', card.buylist_card_id,
          'warnings', private.buylist_card_warnings(caller, card)
        )
        order by card.index
      )
      from unnest(cards) card
    ),
    'replayed', false
  );

  insert into public.buylist_cards (
    id, user_id, deck_id, incoming_oracle_id, as_commander, outgoing_copy_id, outgoing_oracle_id, reason
  )
  select
    card.buylist_card_id, caller, card.deck_id, card.incoming_oracle_id, card.as_commander, card.outgoing_copy_id,
    card.outgoing_oracle_id, card.reason
  from unnest(cards) card;

  return private.save_ai_write(caller, request, result);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_buylist_cards"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."create_buylist_cards"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_buylist_cards"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_buylist_cards"(jsonb) FROM PUBLIC, "anon", "service_role";

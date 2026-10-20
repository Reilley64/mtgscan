CREATE OR REPLACE FUNCTION private.buylist_card_warnings (
  owner_id uuid,
  card     private.new_buylist_card
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  free_count integer;
  other_decks jsonb;
  warnings jsonb := private.plan_warnings(
    owner_id,
    card.deck_id,
    private.buylist_card_effect(
      owner_id,
      card.deck_id,
      card.incoming_oracle_id,
      card.as_commander,
      card.outgoing_copy_id,
      card.outgoing_oracle_id
    ),
    card.outgoing_is_commander
  );
begin
  select count(*) into free_count
    from private.collection_availability a
    where a.user_id = owner_id and a.oracle_id = card.incoming_oracle_id and a.is_free;
  select jsonb_agg(
      jsonb_build_object('deck_id', holding_deck.id, 'name', holding_deck.name, 'priority', holding_deck.priority)
      order by holding_deck.priority, lower(holding_deck.name), holding_deck.id
    )
    into other_decks
    from public.decks holding_deck
    where holding_deck.user_id = owner_id
      and holding_deck.id <> card.deck_id
      and exists (
        select 1
        from public.deck_cards deck_card
        join public.copies copy on copy.user_id = deck_card.user_id and copy.id = deck_card.copy_id
        join public.card_printings printing on printing.id = copy.card_printing_id
        where deck_card.user_id = owner_id and deck_card.deck_id = holding_deck.id and printing.oracle_id = card.incoming_oracle_id
      );

  if free_count > 0 then
    warnings := warnings || jsonb_build_object('code', 'protected_only');
  end if;
  if free_count = 0 and other_decks is not null then
    warnings := warnings || jsonb_build_object('code', 'in_other_decks', 'decks', other_decks);
  end if;
  return warnings;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."buylist_card_warnings"(uuid, private.new_buylist_card) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."buylist_card_warnings"(uuid, private.new_buylist_card) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."buylist_card_warnings"(uuid, private.new_buylist_card) TO "postgres";

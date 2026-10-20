CREATE OR REPLACE FUNCTION private.deck_row (
  deck public.decks
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'deck_id', deck.id,
    'name', deck.name,
    'priority', deck.priority,
    'card_count', (
      select count(*)
      from public.deck_cards deck_card
      where deck_card.user_id = deck.user_id and deck_card.deck_id = deck.id
    ) + (
      select coalesce(sum(basic_land.count), 0)
      from public.deck_basic_lands basic_land
      where basic_land.user_id = deck.user_id and basic_land.deck_id = deck.id
    ),
    'commanders', (
      select coalesce(jsonb_agg(
        jsonb_build_object('copy_id', copy.id, 'name', card.name, 'art_crop_uri', printing.art_crop_uri)
        order by deck_card.commander_at, copy.id
      ), '[]'::jsonb)
      from public.deck_cards deck_card
      join public.copies copy on copy.user_id = deck_card.user_id and copy.id = deck_card.copy_id
      join public.card_printings printing on printing.id = copy.card_printing_id
      join public.cards card on card.oracle_id = printing.oracle_id
      where deck_card.user_id = deck.user_id and deck_card.deck_id = deck.id and deck_card.commander_at is not null
    ),
    'last_used_at', deck.last_used_at
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."deck_row"(public.decks) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."deck_row"(public.decks) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."deck_row"(public.decks) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."deck_row"(public.decks) TO "postgres";

CREATE OR REPLACE FUNCTION private.deck_contents (
  owner_id       uuid,
  chosen_deck_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'copies', coalesce((
      select jsonb_agg(jsonb_build_object(
        'copy_id', copy.id,
        'card_printing_id', copy.card_printing_id,
        'role', private.deck_role(deck_card.commander_at)
      ) order by copy.id)
      from public.deck_cards deck_card
      join public.copies copy on copy.user_id = deck_card.user_id and copy.id = deck_card.copy_id
      where deck_card.user_id = owner_id and deck_card.deck_id = chosen_deck_id
    ), '[]'::jsonb),
    'basic_lands', coalesce((
      select jsonb_agg(jsonb_build_object('oracle_id', basic_land.oracle_id, 'count', basic_land.count) order by basic_land.oracle_id)
      from public.deck_basic_lands basic_land
      where basic_land.user_id = owner_id and basic_land.deck_id = chosen_deck_id
    ), '[]'::jsonb)
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."deck_contents"(uuid, uuid) TO "authenticated", "deck_evaluator";

REVOKE ALL ON FUNCTION "private"."deck_contents"(uuid, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."deck_contents"(uuid, uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."deck_contents"(uuid, uuid) TO "postgres";

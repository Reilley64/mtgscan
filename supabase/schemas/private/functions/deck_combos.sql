CREATE OR REPLACE FUNCTION private.deck_combos (
  contents jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with deck_oracle_card as (
    select distinct on (deck_card.oracle_id) deck_card.oracle_id, deck_card.card
    from private.deck_evaluation_cards(contents) deck_card
    order by deck_card.oracle_id, deck_card.card ->> 'copy_id'
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'cards', private.ordered_cards(jsonb_build_array(first_card.card, second_card.card)),
      'produced_features', to_jsonb(combo.produced_features),
      'bracket_tag', combo.bracket_tag
    )
    order by private.combo_lowest_bracket(combo.bracket_tag) desc, combo.id
  ), '[]'::jsonb)
  from public.combos combo
  join deck_oracle_card first_card on first_card.oracle_id = combo.first_oracle_id
  join deck_oracle_card second_card on second_card.oracle_id = combo.second_oracle_id
  where private.combo_lowest_bracket(combo.bracket_tag) is not null;
$function$;

REVOKE ALL ON FUNCTION "private"."deck_combos"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."deck_combos"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."deck_combos"(jsonb) TO "postgres";

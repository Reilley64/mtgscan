CREATE OR REPLACE FUNCTION private.tagged_deck_cards (
  contents jsonb,
  tag_slug text
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.ordered_cards(coalesce(jsonb_agg(deck_card.card), '[]'::jsonb))
  from private.deck_evaluation_cards(contents) deck_card
  where deck_card.oracle_id in (
    select tagging.oracle_id
    from public.card_taggings tagging
    where tagging.tag_id in (
      select closure.tag_id
      from private.tag_closure(array(select tag.id from public.oracle_tags tag where tag.slug = tag_slug)) as closure(tag_id)
    )
  );
$function$;

REVOKE ALL ON FUNCTION "private"."tagged_deck_cards"(jsonb, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."tagged_deck_cards"(jsonb, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."tagged_deck_cards"(jsonb, text) TO "postgres";

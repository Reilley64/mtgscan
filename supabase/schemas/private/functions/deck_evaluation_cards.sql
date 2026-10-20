CREATE OR REPLACE FUNCTION private.deck_evaluation_cards (
  contents jsonb
)
  RETURNS TABLE (
    card      jsonb,
    oracle_id uuid
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select
    jsonb_build_object('kind', 'copy', 'copy_id', copy.copy_id, 'name', card.name, 'image_uris', to_jsonb(printing.image_uris)),
    card.oracle_id
  from jsonb_to_recordset(contents -> 'copies') as copy(copy_id uuid, card_printing_id uuid)
  join public.card_printings printing on printing.id = copy.card_printing_id
  join public.cards card on card.oracle_id = printing.oracle_id
  union all
  select
    jsonb_build_object(
      'kind', 'basic_land',
      'oracle_id', card.oracle_id,
      'name', card.name,
      'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb)
    ),
    card.oracle_id
  from jsonb_to_recordset(contents -> 'basic_lands') as basic_land(oracle_id uuid)
  join public.cards card on card.oracle_id = basic_land.oracle_id
  left join private.basic_land_cards() land on land.oracle_id = card.oracle_id;
$function$;

REVOKE ALL ON FUNCTION "private"."deck_evaluation_cards"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."deck_evaluation_cards"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."deck_evaluation_cards"(jsonb) TO "postgres";

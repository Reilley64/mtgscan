CREATE OR REPLACE FUNCTION private.planned_card_line (
  card_oracle_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'kind', 'card',
    'oracle_id', card.oracle_id,
    'name', card.name,
    'image_uris', coalesce(to_jsonb(printing.image_uris), '[]'::jsonb),
    'type_line', card.type_line
  )
  from public.cards card
  left join public.card_printings printing on printing.id = private.default_printing_id(card.oracle_id)
  where card.oracle_id = card_oracle_id;
$function$;

GRANT EXECUTE ON FUNCTION "private"."planned_card_line"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."planned_card_line"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."planned_card_line"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."planned_card_line"(uuid) TO "postgres";

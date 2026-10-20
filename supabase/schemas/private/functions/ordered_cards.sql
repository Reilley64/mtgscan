CREATE OR REPLACE FUNCTION private.ordered_cards (
  cards jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select coalesce(jsonb_agg(item.card order by item.card ->> 'name', item.card ->> 'copy_id', item.card ->> 'oracle_id'), '[]'::jsonb)
  from jsonb_array_elements(cards) as item(card);
$function$;

REVOKE ALL ON FUNCTION "private"."ordered_cards"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."ordered_cards"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."ordered_cards"(jsonb) TO "postgres";

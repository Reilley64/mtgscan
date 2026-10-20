CREATE OR REPLACE FUNCTION private.checked_buylist_cards (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select private.checked_plan_items(field, value, 'buylist cards', array['oracle_id'], array['as_commander']);
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_buylist_cards"(text, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."checked_buylist_cards"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_buylist_cards"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_buylist_cards"(text, jsonb) TO "postgres";

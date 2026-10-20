CREATE OR REPLACE FUNCTION private.check_deck_changes_query (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object('limit', 20) || private.checked_object(null, query, array['deck_id'], array['cursor', 'limit']);
$function$;

GRANT EXECUTE ON FUNCTION "private"."check_deck_changes_query"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."check_deck_changes_query"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."check_deck_changes_query"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."check_deck_changes_query"(jsonb) TO "postgres";

CREATE OR REPLACE FUNCTION private.bracket_signal (
  kind           text,
  source         text,
  count          integer,
  lowest_bracket integer,
  cards          jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object('kind', kind, 'source', source, 'count', count, 'lowest_bracket', lowest_bracket, 'cards', cards);
$function$;

REVOKE ALL ON FUNCTION "private"."bracket_signal"(text, text, integer, integer, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."bracket_signal"(text, text, integer, integer, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."bracket_signal"(text, text, integer, integer, jsonb) TO "postgres";

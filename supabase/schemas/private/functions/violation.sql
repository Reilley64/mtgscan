CREATE OR REPLACE FUNCTION private.violation (
  rule     text,
  citation text,
  message  text,
  hint     text
)
  RETURNS jsonb
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object('rule', rule, 'citation', citation, 'message', message, 'hint', hint, 'cards', '[]'::jsonb);
$function$;

REVOKE ALL ON FUNCTION "private"."violation"(text, text, text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."violation"(text, text, text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."violation"(text, text, text, text) TO "postgres";

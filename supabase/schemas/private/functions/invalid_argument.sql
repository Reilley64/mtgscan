CREATE OR REPLACE FUNCTION private.invalid_argument (
  field   text,
  message text
)
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.raise_search_error('invalid_argument', message, field);
$function$;

GRANT EXECUTE ON FUNCTION "private"."invalid_argument"(text, text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."invalid_argument"(text, text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."invalid_argument"(text, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."invalid_argument"(text, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."invalid_argument"(text, text) TO "postgres";

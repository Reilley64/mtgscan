CREATE OR REPLACE FUNCTION private.type_words (
  type_line text
)
  RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select array_remove(regexp_split_to_array(lower(type_line), '[^[:alnum:]]+'), '');
$function$;

GRANT EXECUTE ON FUNCTION "private"."type_words"(text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."type_words"(text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."type_words"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."type_words"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."type_words"(text) TO "postgres";

CREATE OR REPLACE FUNCTION private.card_search_vector (
  name        text,
  type_line   text,
  oracle_text text,
  keywords    text[]
)
  RETURNS tsvector
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select setweight(to_tsvector('english'::regconfig, name), 'A')
    || setweight(to_tsvector('english'::regconfig, type_line), 'C')
    || setweight(to_tsvector('english'::regconfig, oracle_text || ' ' || array_to_string(keywords, ' ')), 'D');
$function$;

GRANT EXECUTE ON FUNCTION "private"."card_search_vector"(text, text, text, text[]) TO "catalog_importer";

REVOKE ALL ON FUNCTION "private"."card_search_vector"(text, text, text, text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."card_search_vector"(text, text, text, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."card_search_vector"(text, text, text, text[]) TO "postgres";

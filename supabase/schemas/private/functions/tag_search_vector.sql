CREATE OR REPLACE FUNCTION private.tag_search_vector (
  label   text,
  aliases text[]
)
  RETURNS tsvector
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select setweight(to_tsvector('english'::regconfig, label), 'A')
    || setweight(to_tsvector('english'::regconfig, array_to_string(aliases, ' ')), 'B');
$function$;

GRANT EXECUTE ON FUNCTION "private"."tag_search_vector"(text, text[]) TO "catalog_importer";

REVOKE ALL ON FUNCTION "private"."tag_search_vector"(text, text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."tag_search_vector"(text, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."tag_search_vector"(text, text[]) TO "postgres";

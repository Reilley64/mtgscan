CREATE OR REPLACE FUNCTION private.keyword_keys (
  keywords text[]
)
  RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select array(select lower(keyword) from unnest(keywords) as keyword);
$function$;

GRANT EXECUTE ON FUNCTION "private"."keyword_keys"(text[]) TO "authenticated", "catalog_importer";

GRANT EXECUTE ON FUNCTION "private"."keyword_keys"(text[]) TO "service_role";

REVOKE ALL ON FUNCTION "private"."keyword_keys"(text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."keyword_keys"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."keyword_keys"(text[]) TO "postgres";

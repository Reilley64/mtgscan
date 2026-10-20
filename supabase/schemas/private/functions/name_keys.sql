CREATE OR REPLACE FUNCTION private.name_keys (
  phrases text[]
)
  RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select array(select private.name_key(phrase) from unnest(phrases) as phrase);
$function$;

GRANT EXECUTE ON FUNCTION "private"."name_keys"(text[]) TO "catalog_importer";

REVOKE ALL ON FUNCTION "private"."name_keys"(text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."name_keys"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."name_keys"(text[]) TO "postgres";

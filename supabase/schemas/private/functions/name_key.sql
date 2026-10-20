CREATE OR REPLACE FUNCTION private.name_key (
  value text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select string_agg(
    regexp_replace(
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, face)),
      '[^[:alnum:]]+',
      '',
      'g'
    ),
    '/'
    order by face_index
  )
  from regexp_split_to_table(value, '\s*//\s*') with ordinality as faces(face, face_index);
$function$;

GRANT EXECUTE ON FUNCTION "private"."name_key"(text) TO "authenticated", "catalog_importer";

GRANT EXECUTE ON FUNCTION "private"."name_key"(text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."name_key"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."name_key"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."name_key"(text) TO "postgres";

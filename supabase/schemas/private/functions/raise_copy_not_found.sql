CREATE OR REPLACE FUNCTION private.raise_copy_not_found()
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.raise_search_error('not_found', 'copy_id is not a copy in your collection.', 'copy_id');
$function$;

GRANT EXECUTE ON FUNCTION "private"."raise_copy_not_found"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."raise_copy_not_found"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."raise_copy_not_found"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."raise_copy_not_found"() TO "postgres";

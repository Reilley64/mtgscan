CREATE OR REPLACE FUNCTION private.raise_user_tag_not_found()
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.raise_search_error('not_found', 'user_tag_id is not one of your user tags.', 'user_tag_id');
$function$;

REVOKE ALL ON FUNCTION "private"."raise_user_tag_not_found"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."raise_user_tag_not_found"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."raise_user_tag_not_found"() TO "postgres";

CREATE OR REPLACE FUNCTION private.raise_user_tag_exists()
  RETURNS void
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.raise_search_error('user_tag_exists', 'You already have a user tag with this name.', 'name');
$function$;

REVOKE ALL ON FUNCTION "private"."raise_user_tag_exists"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."raise_user_tag_exists"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."raise_user_tag_exists"() TO "postgres";

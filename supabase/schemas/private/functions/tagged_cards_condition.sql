CREATE OR REPLACE FUNCTION private.tagged_cards_condition (
  root_tags_query text
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select format(
    'c.oracle_id in (select ct.oracle_id from public.card_taggings ct '
    'where ct.tag_id in (select closure.tag_id from private.tag_closure(array(%s)) as closure(tag_id)))',
    root_tags_query
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."tagged_cards_condition"(text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."tagged_cards_condition"(text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."tagged_cards_condition"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."tagged_cards_condition"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."tagged_cards_condition"(text) TO "postgres";

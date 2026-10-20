CREATE OR REPLACE FUNCTION private.owned_printing_quantity (
  printing_id uuid
)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select count(*)
  from private.collection_availability a
  where a.card_printing_id = owned_printing_quantity.printing_id;
$function$;

GRANT EXECUTE ON FUNCTION "private"."owned_printing_quantity"(uuid) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."owned_printing_quantity"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."owned_printing_quantity"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."owned_printing_quantity"(uuid) TO "postgres";

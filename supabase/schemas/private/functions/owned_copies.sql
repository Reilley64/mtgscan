CREATE OR REPLACE FUNCTION private.owned_copies (
  oracle_id uuid
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'quantity', count(*),
    'free_quantity', count(*) filter (where a.is_free),
    'protected_free_quantity', count(*) filter (where a.is_free and a.is_protected)
  )
  from private.collection_availability a
  where a.oracle_id = owned_copies.oracle_id and not private.caller_uses_secret_key();
$function$;

GRANT EXECUTE ON FUNCTION "private"."owned_copies"(uuid) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."owned_copies"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "private"."owned_copies"(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."owned_copies"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."owned_copies"(uuid) TO "postgres";

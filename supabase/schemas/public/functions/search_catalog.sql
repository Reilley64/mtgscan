CREATE OR REPLACE FUNCTION public.search_catalog (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  SET search_path TO ''
  AS $function$
  select private.run_search('catalog', query);
$function$;

GRANT EXECUTE ON FUNCTION "public"."search_catalog"(jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "public"."search_catalog"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."search_catalog"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_catalog"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."search_catalog"(jsonb) FROM PUBLIC, "anon";

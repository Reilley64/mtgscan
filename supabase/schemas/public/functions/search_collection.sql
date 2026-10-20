CREATE OR REPLACE FUNCTION public.search_collection (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  perform private.caller_user_id();
  return private.run_search('collection', query);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."search_collection"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."search_collection"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."search_collection"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."search_collection"(jsonb) FROM PUBLIC, "anon", "service_role";

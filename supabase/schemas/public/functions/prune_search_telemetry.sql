CREATE OR REPLACE FUNCTION public.prune_search_telemetry()
  RETURNS bigint
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  pruned bigint;
begin
  delete from public.search_telemetry t where t.created_at < now() - interval '180 days';
  get diagnostics pruned = row_count;
  return pruned;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."prune_search_telemetry"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."prune_search_telemetry"() FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "public"."prune_search_telemetry"() TO "catalog_importer";

ALTER FUNCTION "public"."prune_search_telemetry"() OWNER TO "catalog_importer";

REVOKE ALL ON FUNCTION "public"."prune_search_telemetry"() FROM PUBLIC, "anon", "authenticated";

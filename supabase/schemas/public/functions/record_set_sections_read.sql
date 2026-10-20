CREATE OR REPLACE FUNCTION public.record_set_sections_read (
  set_code text
)
  RETURNS void
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  update public.card_sets card_set
    set set_sections_read_at = now()
    where card_set.code = record_set_sections_read.set_code;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_set_sections_read"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_set_sections_read"(text) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "public"."record_set_sections_read"(text) TO "catalog_importer";

ALTER FUNCTION "public"."record_set_sections_read"(text) OWNER TO "catalog_importer";

REVOKE ALL ON FUNCTION "public"."record_set_sections_read"(text) FROM PUBLIC, "anon", "authenticated";

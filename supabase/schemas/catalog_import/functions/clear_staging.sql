CREATE OR REPLACE FUNCTION catalog_import.clear_staging (
  source public.import_source
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  staging_table text;
begin
  foreach staging_table in array catalog_import.staging_tables(clear_staging.source) loop
    execute format('truncate catalog_import.%I', staging_table);
  end loop;
end;
$function$;

GRANT EXECUTE ON FUNCTION "catalog_import"."clear_staging"(public.import_source) TO PUBLIC;

REVOKE ALL ON FUNCTION "catalog_import"."clear_staging"(public.import_source) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "catalog_import"."clear_staging"(public.import_source) TO "catalog_importer";

ALTER FUNCTION "catalog_import"."clear_staging"(public.import_source) OWNER TO "catalog_importer";

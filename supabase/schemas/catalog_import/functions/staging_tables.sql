CREATE OR REPLACE FUNCTION catalog_import.staging_tables (
  source public.import_source
)
  RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case staging_tables.source
    when 'catalog' then array['cards', 'card_faces', 'card_printings']
    when 'oracle_tags' then array['oracle_tags', 'tag_edges', 'card_taggings']
    when 'prices' then array['card_prices']
    when 'commander_spellbook' then array['combos']
    when 'exchange_rates' then array['exchange_rates']
    else array[]::text[]
  end;
$function$;

GRANT EXECUTE ON FUNCTION "catalog_import"."staging_tables"(public.import_source) TO PUBLIC;

REVOKE ALL ON FUNCTION "catalog_import"."staging_tables"(public.import_source) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "catalog_import"."staging_tables"(public.import_source) TO "catalog_importer";

ALTER FUNCTION "catalog_import"."staging_tables"(public.import_source) OWNER TO "catalog_importer";

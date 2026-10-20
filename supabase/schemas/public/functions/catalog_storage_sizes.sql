CREATE OR REPLACE FUNCTION public.catalog_storage_sizes()
  RETURNS TABLE (
    relation    text,
    total_bytes bigint
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select t.relation, pg_total_relation_size(t.relation::regclass)
  from unnest(array[
    'public.cards',
    'public.card_faces',
    'public.card_printings',
    'public.card_prices',
    'public.card_lowest_prices',
    'public.oracle_tags',
    'public.tag_edges',
    'public.card_taggings',
    'public.combos',
    'public.exchange_rates',
    'public.import_runs',
    'public.import_snapshots'
  ]) as t(relation)
  union all
  select 'database', pg_database_size(current_database());
$function$;

GRANT EXECUTE ON FUNCTION "public"."catalog_storage_sizes"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."catalog_storage_sizes"() FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "public"."catalog_storage_sizes"() TO "catalog_importer";

ALTER FUNCTION "public"."catalog_storage_sizes"() OWNER TO "catalog_importer";

REVOKE ALL ON FUNCTION "public"."catalog_storage_sizes"() FROM PUBLIC, "anon", "authenticated";

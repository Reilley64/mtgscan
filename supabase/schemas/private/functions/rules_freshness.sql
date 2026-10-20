CREATE OR REPLACE FUNCTION private.rules_freshness()
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  freshness record;
begin
  select f.snapshot_at, f.is_stale into freshness from public.catalog_freshness() f where f.source = 'catalog';
  if freshness.snapshot_at is null then
    perform private.raise_search_error(
      'data_unavailable',
      'No card catalog import has succeeded yet. Try again later.'
    );
  end if;
  return jsonb_build_object('rules_data_as_of', freshness.snapshot_at, 'rules_stale', freshness.is_stale);
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."rules_freshness"() TO "authenticated";

REVOKE ALL ON FUNCTION "private"."rules_freshness"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."rules_freshness"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."rules_freshness"() TO "postgres";

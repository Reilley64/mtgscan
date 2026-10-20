CREATE OR REPLACE FUNCTION public.get_collection_total (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  prices_freshness record;
  current_total private.collection_totals;
begin
  perform private.caller_user_id();
  perform private.check_collection_total_query(query);

  select * into prices_freshness from public.catalog_freshness() f where f.source = 'prices';
  select * into current_total from private.collection_totals;

  return jsonb_build_object(
    'total', private.usd_amount(coalesce(current_total.total_cents, 0)),
    'currency', 'USD',
    'priced_copies', coalesce(current_total.priced_copies, 0),
    'copies', coalesce(current_total.copies, 0),
    'stale', prices_freshness.is_stale,
    'prices_observed_at', prices_freshness.snapshot_at
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_collection_total"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_collection_total"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_collection_total"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_collection_total"(jsonb) FROM PUBLIC, "anon", "service_role";

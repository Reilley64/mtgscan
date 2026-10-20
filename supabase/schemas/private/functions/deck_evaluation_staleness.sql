CREATE OR REPLACE FUNCTION private.deck_evaluation_staleness (
  evaluation public.deck_evaluations
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with stale_sources as (
    select freshness.source
    from public.catalog_freshness() freshness
    where freshness.succeeded_at is not null and freshness.is_stale
    union
    select behind.source
    from private.rules_data_behind(evaluation) behind
  )
  select jsonb_build_object(
    'validity_stale', exists (select 1 from stale_sources stale where stale.source = 'catalog'),
    'bracket_stale', exists (
      select 1 from stale_sources stale where stale.source in ('catalog', 'oracle_tags', 'commander_spellbook')
    )
  );
$function$;

GRANT EXECUTE ON FUNCTION "private"."deck_evaluation_staleness"(public.deck_evaluations) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."deck_evaluation_staleness"(public.deck_evaluations) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."deck_evaluation_staleness"(public.deck_evaluations) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."deck_evaluation_staleness"(public.deck_evaluations) TO "postgres";

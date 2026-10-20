CREATE OR REPLACE FUNCTION private.rules_data_behind (
  evaluation public.deck_evaluations
)
  RETURNS TABLE (
    source public.import_source
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select snapshot.source
  from public.import_snapshots snapshot
  where evaluation.deck_id is not null
    and snapshot.source in ('catalog', 'oracle_tags', 'commander_spellbook')
    and snapshot.snapshot_at > coalesce(
      case snapshot.source
        when 'catalog' then evaluation.catalog_at
        when 'oracle_tags' then evaluation.oracle_tags_at
        when 'commander_spellbook' then evaluation.commander_spellbook_at
      end,
      '-infinity'
    )
  union
  select 'oracle_tags'::public.import_source
  where evaluation.judged_at < (select max(change.changed_at) from public.disabled_tag_changes change);
$function$;

GRANT EXECUTE ON FUNCTION "private"."rules_data_behind"(public.deck_evaluations) TO "authenticated", "deck_evaluator";

REVOKE ALL ON FUNCTION "private"."rules_data_behind"(public.deck_evaluations) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."rules_data_behind"(public.deck_evaluations) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."rules_data_behind"(public.deck_evaluations) TO "postgres";

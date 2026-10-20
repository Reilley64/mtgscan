CREATE OR REPLACE FUNCTION public.finish_import_run (
  run_id      uuid,
  staged_rows jsonb
)
  RETURNS public.import_runs
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  run public.import_runs;
  merge_started_at timestamptz := clock_timestamp();
  merge_counts jsonb;
begin
  select * into run from public.import_runs r where r.id = finish_import_run.run_id for update;
  if not found or run.status <> 'running' then
    raise exception 'Import run % is not open', finish_import_run.run_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  begin
    case run.source
      when 'catalog' then
        merge_counts := catalog_import.merge_catalog(run, finish_import_run.staged_rows);
      when 'oracle_tags' then
        merge_counts := catalog_import.merge_oracle_tags(run, finish_import_run.staged_rows);
      when 'prices' then
        merge_counts := catalog_import.merge_prices(run, finish_import_run.staged_rows);
      when 'commander_spellbook' then
        merge_counts := catalog_import.merge_combos(run, finish_import_run.staged_rows);
      when 'exchange_rates' then
        merge_counts := catalog_import.merge_exchange_rates(run, finish_import_run.staged_rows);
      else
        raise exception 'No merge exists for % imports', run.source;
    end case;

    update public.import_runs r
      set status = 'succeeded',
        finished_at = clock_timestamp(),
        merge_duration = clock_timestamp() - merge_started_at,
        counts = merge_counts
      where r.id = run.id
      returning * into run;

    insert into public.import_snapshots (source, snapshot_at, succeeded_at, run_id)
      values (
        run.source,
        case when run.source = 'prices' then run.started_at else run.source_updated_at end,
        run.finished_at,
        run.id
      )
      on conflict (source) do update set
        snapshot_at = excluded.snapshot_at,
        succeeded_at = excluded.succeeded_at,
        run_id = excluded.run_id;
  exception when others then
    update public.import_runs r
      set status = 'failed',
        finished_at = clock_timestamp(),
        failure_reason = sqlerrm
      where r.id = run.id
      returning * into run;
  end;

  perform catalog_import.clear_staging(run.source);
  return run;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."finish_import_run"(uuid, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."finish_import_run"(uuid, jsonb) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "public"."finish_import_run"(uuid, jsonb) TO "catalog_importer";

ALTER FUNCTION "public"."finish_import_run"(uuid, jsonb) OWNER TO "catalog_importer";

REVOKE ALL ON FUNCTION "public"."finish_import_run"(uuid, jsonb) FROM PUBLIC, "anon", "authenticated";

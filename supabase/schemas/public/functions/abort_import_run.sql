CREATE OR REPLACE FUNCTION public.abort_import_run (
  run_id uuid,
  reason text
)
  RETURNS public.import_runs
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  run public.import_runs;
begin
  update public.import_runs r
    set status = 'failed',
      finished_at = now(),
      failure_reason = abort_import_run.reason
    where r.id = abort_import_run.run_id and r.status = 'running'
    returning * into run;
  if not found then
    raise exception 'Import run % is not open', abort_import_run.run_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  perform catalog_import.clear_staging(run.source);
  return run;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."abort_import_run"(uuid, text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."abort_import_run"(uuid, text) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "public"."abort_import_run"(uuid, text) TO "catalog_importer";

ALTER FUNCTION "public"."abort_import_run"(uuid, text) OWNER TO "catalog_importer";

REVOKE ALL ON FUNCTION "public"."abort_import_run"(uuid, text) FROM PUBLIC, "anon", "authenticated";

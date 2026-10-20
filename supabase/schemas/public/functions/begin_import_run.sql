CREATE OR REPLACE FUNCTION public.begin_import_run (
  source            public.import_source,
  source_updated_at timestamp with time zone,
  accept_shrink     boolean                  DEFAULT false
)
  RETURNS public.import_runs
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  run public.import_runs;
  last_good_source_updated_at timestamptz;
begin
  update public.import_runs r
    set status = 'expired',
      finished_at = now(),
      failure_reason = 'The run stayed open for more than 2 hours'
    where r.source = begin_import_run.source
      and r.status = 'running'
      and r.started_at < now() - interval '2 hours';
  if found then
    perform catalog_import.clear_staging(begin_import_run.source);
  end if;

  select good_run.source_updated_at into last_good_source_updated_at
    from public.import_snapshots s
    join public.import_runs good_run on good_run.id = s.run_id
    where s.source = begin_import_run.source;

  if last_good_source_updated_at is not null
    and begin_import_run.source_updated_at <= last_good_source_updated_at then
    insert into public.import_runs (source, status, source_updated_at, accept_shrink, finished_at)
      values (
        begin_import_run.source,
        'skipped',
        begin_import_run.source_updated_at,
        begin_import_run.accept_shrink,
        now()
      )
      returning * into run;
    return run;
  end if;

  begin
    insert into public.import_runs (source, source_updated_at, accept_shrink)
      values (begin_import_run.source, begin_import_run.source_updated_at, begin_import_run.accept_shrink)
      returning * into run;
  exception when unique_violation then
    raise exception 'A % import run is already open', begin_import_run.source
      using errcode = 'object_in_use';
  end;
  return run;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."begin_import_run"(public.import_source, timestamp WITH time zone, boolean) TO "service_role";

REVOKE ALL ON FUNCTION "public"."begin_import_run"(public.import_source, timestamp WITH time zone, boolean) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "public"."begin_import_run"(public.import_source, timestamp WITH time zone, boolean) TO "catalog_importer";

ALTER FUNCTION "public"."begin_import_run"(public.import_source, timestamp WITH time zone, boolean) OWNER TO "catalog_importer";

REVOKE ALL ON FUNCTION "public"."begin_import_run"(public.import_source, timestamp WITH time zone, boolean) FROM PUBLIC, "anon", "authenticated";

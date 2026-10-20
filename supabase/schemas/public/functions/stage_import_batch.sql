CREATE OR REPLACE FUNCTION public.stage_import_batch (
  run_id       uuid,
  target       text,
  batch_number integer,
  batch_rows   jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  run public.import_runs;
  staged integer;
begin
  select * into run from public.import_runs r where r.id = stage_import_batch.run_id;
  if not found or run.status <> 'running' then
    raise exception 'Import run % is not open', stage_import_batch.run_id
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  if not stage_import_batch.target = any (catalog_import.staging_tables(run.source)) then
    raise exception '% is not a staging target for % imports', stage_import_batch.target, run.source
      using errcode = 'invalid_parameter_value';
  end if;

  execute format('delete from catalog_import.%I s where s.run_id = $1 and s.batch_number = $2', stage_import_batch.target)
    using run.id, stage_import_batch.batch_number;
  execute format(
    'insert into catalog_import.%1$I '
    'select (jsonb_populate_record(null::catalog_import.%1$I, r || jsonb_build_object(''run_id'', $1, ''batch_number'', $2))).* '
    'from jsonb_array_elements($3) r',
    stage_import_batch.target
  )
    using run.id, stage_import_batch.batch_number, stage_import_batch.batch_rows;

  get diagnostics staged = row_count;
  return staged;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."stage_import_batch"(uuid, text, integer, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."stage_import_batch"(uuid, text, integer, jsonb) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "public"."stage_import_batch"(uuid, text, integer, jsonb) TO "catalog_importer";

ALTER FUNCTION "public"."stage_import_batch"(uuid, text, integer, jsonb) OWNER TO "catalog_importer";

REVOKE ALL ON FUNCTION "public"."stage_import_batch"(uuid, text, integer, jsonb) FROM PUBLIC, "anon", "authenticated";

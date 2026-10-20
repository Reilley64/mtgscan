CREATE OR REPLACE FUNCTION catalog_import.merge_combos (
  run         public.import_runs,
  staged_rows jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  staged_combos bigint;
  missing bigint;
  dropped_combos bigint;
  combos_inserted bigint;
  combos_updated bigint;
  combos_deleted bigint;
begin
  select count(*), count(*) filter (
      where num_nulls(id, color_identity, produced_features, bracket_tag) > 0
    )
    into staged_combos, missing
    from catalog_import.combos s
    where s.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'combos', staged_rows -> 'combos', staged_combos, missing);

  delete from catalog_import.combos s
    where s.run_id = run.id
      and (
        not exists (select 1 from public.cards c where c.oracle_id = s.first_oracle_id)
        or not exists (select 1 from public.cards c where c.oracle_id = s.second_oracle_id)
      );
  get diagnostics dropped_combos = row_count;

  perform catalog_import.check_shrink(
    'combos',
    (select count(*) from public.combos),
    staged_combos - dropped_combos,
    run.accept_shrink
  );

  delete from public.combos live
    where not exists (select 1 from catalog_import.combos s where s.run_id = run.id and s.id = live.id);
  get diagnostics combos_deleted = row_count;

  with merged as (
    insert into public.combos as live (
      id, first_oracle_id, second_oracle_id, color_identity, produced_features, bracket_tag
    )
    select s.id, s.first_oracle_id, s.second_oracle_id, s.color_identity, s.produced_features, s.bracket_tag
    from catalog_import.combos s
    where s.run_id = run.id
    on conflict (id) do update set
      first_oracle_id = excluded.first_oracle_id,
      second_oracle_id = excluded.second_oracle_id,
      color_identity = excluded.color_identity,
      produced_features = excluded.produced_features,
      bracket_tag = excluded.bracket_tag
    where (
      live.first_oracle_id, live.second_oracle_id, live.color_identity, live.produced_features, live.bracket_tag
    ) is distinct from (
      excluded.first_oracle_id, excluded.second_oracle_id, excluded.color_identity, excluded.produced_features,
      excluded.bracket_tag
    )
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into combos_inserted, combos_updated
    from merged;

  return jsonb_build_object(
    'combos', jsonb_build_object(
      'staged', staged_combos,
      'accepted', staged_combos - dropped_combos,
      'dropped', dropped_combos,
      'inserted', combos_inserted,
      'updated', combos_updated,
      'deleted', combos_deleted
    )
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "catalog_import"."merge_combos"(public.import_runs, jsonb) TO PUBLIC;

REVOKE ALL ON FUNCTION "catalog_import"."merge_combos"(public.import_runs, jsonb) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "catalog_import"."merge_combos"(public.import_runs, jsonb) TO "catalog_importer";

ALTER FUNCTION "catalog_import"."merge_combos"(public.import_runs, jsonb) OWNER TO "catalog_importer";

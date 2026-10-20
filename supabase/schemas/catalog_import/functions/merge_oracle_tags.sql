CREATE OR REPLACE FUNCTION catalog_import.merge_oracle_tags (
  run         public.import_runs,
  staged_rows jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  staged_tags bigint;
  staged_edges bigint;
  staged_taggings bigint;
  missing bigint;
  dropped_edges bigint;
  dropped_taggings bigint;
  tags_inserted bigint;
  tags_updated bigint;
  tags_deleted bigint;
  edges_inserted bigint;
  edges_deleted bigint;
  taggings_inserted bigint;
  taggings_deleted bigint;
begin
  select count(*), count(*) filter (where num_nulls(id, slug, label, aliases) > 0)
    into staged_tags, missing
    from catalog_import.oracle_tags t
    where t.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'oracle_tags', staged_rows -> 'oracle_tags', staged_tags, missing);

  select count(*), count(*) filter (where num_nulls(parent_id, child_id) > 0)
    into staged_edges, missing
    from catalog_import.tag_edges e
    where e.run_id = run.id;
  perform catalog_import.check_staged_rows(run.id, 'tag_edges', staged_rows -> 'tag_edges', staged_edges, missing);

  select count(*), count(*) filter (where num_nulls(tag_id, oracle_id) > 0)
    into staged_taggings, missing
    from catalog_import.card_taggings g
    where g.run_id = run.id;
  perform catalog_import.check_staged_rows(
    run.id, 'card_taggings', staged_rows -> 'card_taggings', staged_taggings, missing
  );

  delete from catalog_import.tag_edges e
    where e.run_id = run.id
      and (
        not exists (select 1 from catalog_import.oracle_tags t where t.run_id = run.id and t.id = e.parent_id)
        or not exists (select 1 from catalog_import.oracle_tags t where t.run_id = run.id and t.id = e.child_id)
      );
  get diagnostics dropped_edges = row_count;

  delete from catalog_import.card_taggings g
    where g.run_id = run.id
      and (
        not exists (select 1 from public.cards c where c.oracle_id = g.oracle_id)
        or not exists (select 1 from catalog_import.oracle_tags t where t.run_id = run.id and t.id = g.tag_id)
      );
  get diagnostics dropped_taggings = row_count;

  perform catalog_import.check_shrink(
    'oracle_tags',
    (select count(*) from public.oracle_tags),
    staged_tags,
    run.accept_shrink
  );
  perform catalog_import.check_shrink(
    'tag_edges',
    (select count(*) from public.tag_edges),
    staged_edges - dropped_edges,
    run.accept_shrink
  );
  perform catalog_import.check_shrink(
    'card_taggings',
    (select count(*) from public.card_taggings),
    staged_taggings - dropped_taggings,
    run.accept_shrink
  );

  delete from public.card_taggings live
    where not exists (
      select 1
      from catalog_import.card_taggings g
      where g.run_id = run.id and g.tag_id = live.tag_id and g.oracle_id = live.oracle_id
    );
  get diagnostics taggings_deleted = row_count;

  delete from public.tag_edges live
    where not exists (
      select 1
      from catalog_import.tag_edges e
      where e.run_id = run.id and e.parent_id = live.parent_id and e.child_id = live.child_id
    );
  get diagnostics edges_deleted = row_count;

  delete from public.oracle_tags live
    where not exists (select 1 from catalog_import.oracle_tags t where t.run_id = run.id and t.id = live.id);
  get diagnostics tags_deleted = row_count;

  with merged as (
    insert into public.oracle_tags as live (id, slug, label, description, aliases)
    select t.id, t.slug, t.label, t.description, t.aliases
    from catalog_import.oracle_tags t
    where t.run_id = run.id
    on conflict (id) do update set
      slug = excluded.slug,
      label = excluded.label,
      description = excluded.description,
      aliases = excluded.aliases
    where (live.slug, live.label, live.description, live.aliases)
      is distinct from (excluded.slug, excluded.label, excluded.description, excluded.aliases)
    returning xmax = 0 as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted)
    into tags_inserted, tags_updated
    from merged;

  insert into public.tag_edges (parent_id, child_id)
    select distinct e.parent_id, e.child_id
    from catalog_import.tag_edges e
    where e.run_id = run.id
    on conflict do nothing;
  get diagnostics edges_inserted = row_count;

  insert into public.card_taggings (tag_id, oracle_id)
    select distinct g.tag_id, g.oracle_id
    from catalog_import.card_taggings g
    where g.run_id = run.id
    on conflict do nothing;
  get diagnostics taggings_inserted = row_count;

  return jsonb_build_object(
    'oracle_tags', jsonb_build_object(
      'staged', staged_tags,
      'inserted', tags_inserted,
      'updated', tags_updated,
      'deleted', tags_deleted
    ),
    'tag_edges', jsonb_build_object(
      'staged', staged_edges,
      'accepted', staged_edges - dropped_edges,
      'dropped', dropped_edges,
      'inserted', edges_inserted,
      'deleted', edges_deleted
    ),
    'card_taggings', jsonb_build_object(
      'staged', staged_taggings,
      'accepted', staged_taggings - dropped_taggings,
      'dropped', dropped_taggings,
      'inserted', taggings_inserted,
      'deleted', taggings_deleted
    )
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "catalog_import"."merge_oracle_tags"(public.import_runs, jsonb) TO PUBLIC;

REVOKE ALL ON FUNCTION "catalog_import"."merge_oracle_tags"(public.import_runs, jsonb) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "catalog_import"."merge_oracle_tags"(public.import_runs, jsonb) TO "catalog_importer";

ALTER FUNCTION "catalog_import"."merge_oracle_tags"(public.import_runs, jsonb) OWNER TO "catalog_importer";

CREATE OR REPLACE FUNCTION catalog_import.check_staged_rows (
  run_id           uuid,
  target           text,
  expected         jsonb,
  staged           bigint,
  missing_required bigint
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if expected is null or jsonb_typeof(expected) <> 'number' then
    raise exception '%: the import job sent no row count', target;
  end if;
  if staged <> expected::bigint then
    raise exception '%: % of % staged rows arrived', target, staged, expected::bigint;
  end if;
  if missing_required > 0 then
    raise exception '%: required fields are missing in % staged rows', target, missing_required;
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "catalog_import"."check_staged_rows"(uuid, text, jsonb, bigint, bigint) TO PUBLIC;

REVOKE ALL ON FUNCTION "catalog_import"."check_staged_rows"(uuid, text, jsonb, bigint, bigint) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "catalog_import"."check_staged_rows"(uuid, text, jsonb, bigint, bigint) TO "catalog_importer";

ALTER FUNCTION "catalog_import"."check_staged_rows"(uuid, text, jsonb, bigint, bigint) OWNER TO "catalog_importer";

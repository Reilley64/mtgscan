CREATE OR REPLACE FUNCTION catalog_import.check_shrink (
  target        text,
  live_rows     bigint,
  new_rows      bigint,
  accept_shrink boolean
)
  RETURNS void
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if not accept_shrink and live_rows > 0 and new_rows < live_rows * 0.95 then
    raise exception '%: would shrink by more than 5%% (from % to % rows)', target, live_rows, new_rows;
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "catalog_import"."check_shrink"(text, bigint, bigint, boolean) TO PUBLIC;

REVOKE ALL ON FUNCTION "catalog_import"."check_shrink"(text, bigint, bigint, boolean) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "catalog_import"."check_shrink"(text, bigint, bigint, boolean) TO "catalog_importer";

ALTER FUNCTION "catalog_import"."check_shrink"(text, bigint, bigint, boolean) OWNER TO "catalog_importer";

CREATE OR REPLACE FUNCTION private.collection_filter_conditions (
  checked jsonb
)
  RETURNS text[]
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  return private.card_filter_conditions(checked)
    || private.printing_filter_conditions(checked, '(%s)')
    || private.copy_filter_conditions(checked);
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."collection_filter_conditions"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."collection_filter_conditions"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."collection_filter_conditions"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."collection_filter_conditions"(jsonb) TO "postgres";

CREATE OR REPLACE FUNCTION private.check_collection_total_query (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  field text;
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  select min(entry.key) into field from jsonb_object_keys(query) as entry(key);
  if field is not null then
    perform private.invalid_argument(field, format('%s is not a known field.', field));
  end if;
  return check_collection_total_query.query;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."check_collection_total_query"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."check_collection_total_query"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."check_collection_total_query"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."check_collection_total_query"(jsonb) TO "postgres";

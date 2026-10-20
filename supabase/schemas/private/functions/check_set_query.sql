CREATE OR REPLACE FUNCTION private.check_set_query (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb := '{}';
  checked_value jsonb;
  field text;
  value jsonb;
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    checked_value := case
      when field = 'code' then
        private.checked_text(field, value, 16)
    end;
    if checked_value is null then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'code' then
    perform private.invalid_argument('code', 'code is required.');
  end if;
  return checked;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."check_set_query"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."check_set_query"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."check_set_query"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."check_set_query"(jsonb) TO "postgres";

CREATE OR REPLACE FUNCTION private.check_card_printings_query (
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
      when field = 'oracle_id' then
        private.checked_uuid(field, value)
      when field = 'owned_only' then
        private.checked_boolean(field, value)
      when field = 'limit' then
        private.checked_integer(field, value, 1, 50)
      when field = 'cursor' then
        case when jsonb_typeof(value) in ('string', 'null') then value end
    end;
    if checked_value is null then
      if field = 'cursor' then
        perform private.invalid_argument(field, 'cursor must be a string or null.');
      else
        perform private.invalid_argument(field, format('%s is not a known field.', field));
      end if;
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'oracle_id' then
    perform private.invalid_argument('oracle_id', 'oracle_id is required.');
  end if;
  return jsonb_build_object('owned_only', false, 'limit', 20) || checked;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."check_card_printings_query"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."check_card_printings_query"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."check_card_printings_query"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."check_card_printings_query"(jsonb) TO "postgres";

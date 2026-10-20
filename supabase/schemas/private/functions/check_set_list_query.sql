CREATE OR REPLACE FUNCTION private.check_set_list_query (
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
  after_key jsonb;
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    checked_value := case
      when field = 'text' then
        case when jsonb_typeof(value) = 'string' and char_length(value #>> '{}') between 1 and 100 then value end
      when field = 'finish_view' then
        private.checked_choice(field, value, array['any', 'nonfoil', 'foil'])
      when field = 'limit' then
        private.checked_integer(field, value, 1, 50)
      when field = 'cursor' then
        case when jsonb_typeof(value) in ('string', 'null') then value end
    end;
    if checked_value is null then
      perform private.invalid_argument(field, case field
        when 'text' then 'text must be a string of 1 to 100 characters.'
        when 'cursor' then 'cursor must be a string or null.'
        else format('%s is not a known field.', field)
      end);
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'finish_view' then
    perform private.invalid_argument('finish_view', 'finish_view is required.');
  end if;
  checked := jsonb_build_object('limit', 20) || checked
    || jsonb_build_object('query_hash', md5(concat_ws(' ', 'sets', checked ->> 'finish_view', checked ->> 'text')));

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    after_key := private.read_page_cursor(checked ->> 'cursor', checked ->> 'query_hash', 3);
    if jsonb_typeof(after_key -> 0) <> 'string' or jsonb_typeof(after_key -> 1) <> 'string' or jsonb_typeof(after_key -> 2) <> 'string' then
      perform private.raise_search_error('invalid_cursor', 'The cursor is not valid. Start again without a cursor.', 'cursor');
    end if;
    checked := checked || jsonb_build_object('after', after_key);
  end if;
  return checked;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."check_set_list_query"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."check_set_list_query"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."check_set_list_query"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."check_set_list_query"(jsonb) TO "postgres";

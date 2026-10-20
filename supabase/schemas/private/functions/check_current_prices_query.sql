CREATE OR REPLACE FUNCTION private.check_current_prices_query (
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
      when field = 'items' then
        (
          select jsonb_agg(private.checked_current_price_item(format('items[%s]', e.ordinality - 1), e.element) order by e.ordinality)
          from jsonb_array_elements(private.checked_list(field, value, 1, 100)) with ordinality as e(element, ordinality)
        )
    end;
    if checked_value is null then
      perform private.invalid_argument(field, format('%s is not a known field.', field));
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'items' then
    perform private.invalid_argument('items', 'items is required.');
  end if;
  return checked;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."check_current_prices_query"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."check_current_prices_query"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."check_current_prices_query"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."check_current_prices_query"(jsonb) TO "postgres";

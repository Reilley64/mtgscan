CREATE OR REPLACE FUNCTION private.checked_list (
  field     text,
  value     jsonb,
  min_items integer,
  max_items integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  item jsonb;
  item_index bigint;
begin
  if jsonb_typeof(value) is distinct from 'array'
    or jsonb_array_length(value) not between min_items and max_items then
    perform private.invalid_argument(
      field,
      format('%s must be a list of %s to %s values.', field, min_items, max_items)
    );
  end if;
  for item, item_index in
    select element, ordinality - 1 from jsonb_array_elements(value) with ordinality as e(element, ordinality)
  loop
    if exists (
      select 1
      from jsonb_array_elements(value) with ordinality as earlier(element, ordinality)
      where earlier.element = item and earlier.ordinality - 1 < item_index
    ) then
      perform private.invalid_argument(
        format('%s[%s]', field, item_index),
        format('%s[%s] repeats another value in %s.', field, item_index, field)
      );
    end if;
  end loop;
  return value;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_list"(text, jsonb, integer, integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_list"(text, jsonb, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_list"(text, jsonb, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_list"(text, jsonb, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_list"(text, jsonb, integer, integer) TO "postgres";

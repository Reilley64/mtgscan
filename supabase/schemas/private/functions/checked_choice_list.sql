CREATE OR REPLACE FUNCTION private.checked_choice_list (
  field     text,
  value     jsonb,
  choices   text[],
  min_items integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  item_index integer;
begin
  perform private.checked_list(field, value, min_items, cardinality(choices));
  for item_index in 0 .. jsonb_array_length(value) - 1 loop
    perform private.checked_choice(format('%s[%s]', field, item_index), value -> item_index, choices);
  end loop;
  return value;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_choice_list"(text, jsonb, text[], integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_choice_list"(text, jsonb, text[], integer) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_choice_list"(text, jsonb, text[], integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_choice_list"(text, jsonb, text[], integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_choice_list"(text, jsonb, text[], integer) TO "postgres";

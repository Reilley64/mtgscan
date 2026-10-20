CREATE OR REPLACE FUNCTION private.checked_text_list (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  item_index integer;
begin
  perform private.checked_list(field, value, 1, 10);
  for item_index in 0 .. jsonb_array_length(value) - 1 loop
    perform private.checked_text(format('%s[%s]', field, item_index), value -> item_index, 100);
  end loop;
  return value;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_text_list"(text, jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_text_list"(text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_text_list"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_text_list"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_text_list"(text, jsonb) TO "postgres";

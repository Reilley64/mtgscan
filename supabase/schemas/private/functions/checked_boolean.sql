CREATE OR REPLACE FUNCTION private.checked_boolean (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if jsonb_typeof(value) is distinct from 'boolean' then
    perform private.invalid_argument(field, format('%s must be true or false.', field));
  end if;
  return value;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_boolean"(text, jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_boolean"(text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_boolean"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_boolean"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_boolean"(text, jsonb) TO "postgres";

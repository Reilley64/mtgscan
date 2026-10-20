CREATE OR REPLACE FUNCTION private.checked_choice (
  field   text,
  value   jsonb,
  choices text[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if jsonb_typeof(value) is distinct from 'string' or not (value #>> '{}' = any (choices)) then
    perform private.invalid_argument(
      field,
      format('%s must be one of: %s.', field, array_to_string(choices, ', '))
    );
  end if;
  return value;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_choice"(text, jsonb, text[]) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_choice"(text, jsonb, text[]) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_choice"(text, jsonb, text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_choice"(text, jsonb, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_choice"(text, jsonb, text[]) TO "postgres";

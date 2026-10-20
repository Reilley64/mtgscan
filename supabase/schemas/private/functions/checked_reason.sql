CREATE OR REPLACE FUNCTION private.checked_reason (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
begin
  if jsonb_typeof(value) is distinct from 'string' or char_length(value #>> '{}') not between 20 and 600 then
    perform private.invalid_argument(field, format('%s must be a string of 20 to 600 characters.', field));
  end if;
  return value;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_reason"(text, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."checked_reason"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_reason"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_reason"(text, jsonb) TO "postgres";

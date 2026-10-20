CREATE OR REPLACE FUNCTION private.checked_cursor (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
begin
  if jsonb_typeof(value) not in ('string', 'null') then
    perform private.invalid_argument(field, format('%s must be a string or null.', field));
  end if;
  return value;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_cursor"(text, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."checked_cursor"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_cursor"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_cursor"(text, jsonb) TO "postgres";

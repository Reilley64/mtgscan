CREATE OR REPLACE FUNCTION private.checked_price (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if jsonb_typeof(value) is distinct from 'string' or (value #>> '{}') !~ '^[0-9]{1,10}(\.[0-9]{1,2})?$' then
    perform private.invalid_argument(
      field,
      format('%s must be a decimal amount from 0 to 9999999999.99 as a string, such as "4.99".', field)
    );
  end if;
  return value;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_price"(text, jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_price"(text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_price"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_price"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_price"(text, jsonb) TO "postgres";

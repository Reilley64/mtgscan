CREATE OR REPLACE FUNCTION private.checked_uuid (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if jsonb_typeof(value) is distinct from 'string'
    or (value #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform private.invalid_argument(field, format('%s must be a UUID.', field));
  end if;
  return to_jsonb((value #>> '{}')::uuid);
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_uuid"(text, jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_uuid"(text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_uuid"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_uuid"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_uuid"(text, jsonb) TO "postgres";

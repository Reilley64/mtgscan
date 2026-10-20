CREATE OR REPLACE FUNCTION private.checked_outgoing (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb := private.checked_object(field, value, '{}', array['copy_id', 'basic_land_oracle_id']);
begin
  if (select count(*) from jsonb_object_keys(checked)) <> 1 then
    perform private.invalid_argument(field, format('%s must have either copy_id or basic_land_oracle_id.', field));
  end if;
  return checked;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_outgoing"(text, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."checked_outgoing"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_outgoing"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_outgoing"(text, jsonb) TO "postgres";

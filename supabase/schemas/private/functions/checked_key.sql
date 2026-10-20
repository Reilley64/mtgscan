CREATE OR REPLACE FUNCTION private.checked_key (
  field      text,
  value      jsonb,
  min_length integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
begin
  if jsonb_typeof(value) is distinct from 'string' or (value #>> '{}') !~ format('^[A-Za-z0-9_-]{%s,64}$', min_length) then
    perform private.invalid_argument(field, format('%s must be %s to 64 of A-Z a-z 0-9 _ -.', field, min_length));
  end if;
  return value;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_key"(text, jsonb, integer) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."checked_key"(text, jsonb, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_key"(text, jsonb, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_key"(text, jsonb, integer) TO "postgres";

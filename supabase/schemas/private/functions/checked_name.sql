CREATE OR REPLACE FUNCTION private.checked_name (
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
declare
  trimmed text;
begin
  if jsonb_typeof(value) is distinct from 'string' then
    perform private.invalid_argument('name', 'name must be a string.');
  end if;
  trimmed := regexp_replace(value #>> '{}', '^\s+|\s+$', '', 'g');
  if char_length(trimmed) not between 1 and 64 then
    perform private.invalid_argument('name', 'name must be 1 to 64 characters after trimming.');
  end if;
  return to_jsonb(trimmed);
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_name"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."checked_name"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_name"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_name"(jsonb) TO "postgres";

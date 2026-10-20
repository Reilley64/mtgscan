CREATE OR REPLACE FUNCTION private.checked_text (
  field      text,
  value      jsonb,
  max_length integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if jsonb_typeof(value) is distinct from 'string' then
    perform private.invalid_argument(field, format('%s must be a string.', field));
  end if;
  if char_length(value #>> '{}') not between 1 and max_length then
    perform private.invalid_argument(
      field,
      format('%s must be a string of 1 to %s characters.', field, max_length)
    );
  end if;
  if (value #>> '{}') !~ '[[:alnum:]]' then
    perform private.invalid_argument(field, format('%s must contain a letter or a digit.', field));
  end if;
  return value;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_text"(text, jsonb, integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_text"(text, jsonb, integer) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_text"(text, jsonb, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_text"(text, jsonb, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_text"(text, jsonb, integer) TO "postgres";

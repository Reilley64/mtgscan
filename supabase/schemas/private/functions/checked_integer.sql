CREATE OR REPLACE FUNCTION private.checked_integer (
  field   text,
  value   jsonb,
  minimum integer,
  maximum integer
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if jsonb_typeof(value) is distinct from 'number' then
    perform private.invalid_argument(field, format('%s must be a number.', field));
  end if;
  if value::numeric <> trunc(value::numeric) or value::numeric not between minimum and maximum then
    perform private.invalid_argument(
      field,
      format('%s must be a whole number from %s to %s.', field, minimum, maximum)
    );
  end if;
  return to_jsonb(value::integer);
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_integer"(text, jsonb, integer, integer) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_integer"(text, jsonb, integer, integer) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_integer"(text, jsonb, integer, integer) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_integer"(text, jsonb, integer, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_integer"(text, jsonb, integer, integer) TO "postgres";

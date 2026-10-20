CREATE OR REPLACE FUNCTION private.checked_copy_ids (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 1 and 999 then
    perform private.invalid_argument(field, format('%s must be a list of 1 to 999 copy IDs.', field));
  end if;
  return (
    select jsonb_agg(private.checked_uuid(format('%s[%s]', field, e.ordinality - 1), e.element) order by e.ordinality)
    from jsonb_array_elements(value) with ordinality as e(element, ordinality)
  );
end;
$function$;

REVOKE ALL ON FUNCTION "private"."checked_copy_ids"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_copy_ids"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_copy_ids"(text, jsonb) TO "postgres";

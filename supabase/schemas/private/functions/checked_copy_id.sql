CREATE OR REPLACE FUNCTION private.checked_copy_id (
  request      jsonb,
  other_fields text[] DEFAULT '{}'::text[]
)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  unknown_field text;
begin
  if jsonb_typeof(request) is distinct from 'object' then
    perform private.invalid_argument(null, 'The request must be a JSON object.');
  end if;
  select field into unknown_field
    from jsonb_object_keys(request) as field
    where field <> 'copy_id' and field <> all (other_fields)
    order by field
    limit 1;
  if unknown_field is not null then
    perform private.invalid_argument(unknown_field, format('%s is not a known field.', unknown_field));
  end if;
  if not request ? 'copy_id' then
    perform private.invalid_argument('copy_id', 'copy_id is required.');
  end if;
  return private.checked_uuid('copy_id', request -> 'copy_id') #>> '{}';
end;
$function$;

REVOKE ALL ON FUNCTION "private"."checked_copy_id"(jsonb, text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_copy_id"(jsonb, text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_copy_id"(jsonb, text[]) TO "postgres";

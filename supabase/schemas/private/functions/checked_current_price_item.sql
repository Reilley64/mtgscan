CREATE OR REPLACE FUNCTION private.checked_current_price_item (
  field text,
  item  jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO ''
  AS $function$
declare
  checked jsonb := '{}';
  key text;
begin
  if jsonb_typeof(item) is distinct from 'object' then
    perform private.invalid_argument(field, format('%s must be a JSON object.', field));
  end if;

  foreach key in array array['printing_id', 'finish'] loop
    if not item ? key then
      perform private.invalid_argument(format('%s.%s', field, key), format('%s.%s is required.', field, key));
    end if;
    checked := checked || jsonb_build_object(key, case key
      when 'printing_id' then
        private.checked_uuid(format('%s.%s', field, key), item -> key)
      when 'finish' then
        private.checked_choice(format('%s.%s', field, key), item -> key, enum_range(null::public.card_finish)::text[])
    end);
  end loop;

  select entry.key into key
    from jsonb_object_keys(item) as entry(key)
    where not checked ? entry.key
    order by entry.key
    limit 1;
  if found then
    perform private.invalid_argument(format('%s.%s', field, key), format('%s.%s is not a known field.', field, key));
  end if;
  return checked;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_current_price_item"(text, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."checked_current_price_item"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_current_price_item"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_current_price_item"(text, jsonb) TO "postgres";

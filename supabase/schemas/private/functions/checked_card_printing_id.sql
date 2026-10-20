CREATE OR REPLACE FUNCTION private.checked_card_printing_id (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  perform private.checked_uuid(field, value);
  if not exists (select 1 from public.card_printings p where p.id = (value #>> '{}')::uuid) then
    perform private.invalid_argument(field, format('%s must be a card printing in the card catalog.', field));
  end if;
  return value;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."checked_card_printing_id"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_card_printing_id"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_card_printing_id"(text, jsonb) TO "postgres";

CREATE OR REPLACE FUNCTION private.checked_scan_batch_item (
  field text,
  item  jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb := '{}';
  key text;
  value jsonb;
  printing_id uuid;
  printing_finishes public.card_finish[];
  card_type_line text;
begin
  if jsonb_typeof(item) is distinct from 'object' then
    perform private.invalid_argument(field, format('%s must be a JSON object.', field));
  end if;

  foreach key in array array['card_printing_id', 'finish', 'condition', 'language', 'copy_ids'] loop
    value := item -> key;
    if value is null then
      perform private.invalid_argument(format('%s.%s', field, key), format('%s.%s is required.', field, key));
    end if;
    checked := checked || jsonb_build_object(key, case key
      when 'card_printing_id' then
        private.checked_uuid(format('%s.%s', field, key), value)
      when 'finish' then
        private.checked_choice(format('%s.%s', field, key), value, enum_range(null::public.card_finish)::text[])
      when 'condition' then
        private.checked_choice(format('%s.%s', field, key), value, enum_range(null::public.card_condition)::text[])
      when 'language' then
        private.checked_choice(format('%s.%s', field, key), value, enum_range(null::public.card_language)::text[])
      when 'copy_ids' then
        private.checked_copy_ids(format('%s.%s', field, key), value)
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

  printing_id := (checked ->> 'card_printing_id')::uuid;
  select p.finishes, c.type_line
    into printing_finishes, card_type_line
    from public.card_printings p
    join public.cards c on c.oracle_id = p.oracle_id
    where p.id = printing_id;
  if not found then
    perform private.raise_search_error(
      'unknown_printing',
      format('%s.card_printing_id is not a card printing in the card catalog.', field),
      format('%s.card_printing_id', field)
    );
  end if;
  if private.some_face_has_type_words(card_type_line, array['basic']) then
    perform private.raise_search_error(
      'basic_land',
      format('%s.card_printing_id is a basic land. Basic lands are not tracked.', field),
      format('%s.card_printing_id', field)
    );
  end if;
  if not (checked ->> 'finish')::public.card_finish = any (printing_finishes) then
    perform private.invalid_argument(
      format('%s.finish', field),
      format(
        '%s.finish must be one of the finishes of this card printing: %s.',
        field,
        array_to_string(printing_finishes, ', ')
      )
    );
  end if;
  return checked;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."checked_scan_batch_item"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_scan_batch_item"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_scan_batch_item"(text, jsonb) TO "postgres";

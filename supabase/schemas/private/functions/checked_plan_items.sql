CREATE OR REPLACE FUNCTION private.checked_plan_items (
  field                    text,
  value                    jsonb,
  noun                     text,
  required_incoming_fields text[],
  optional_incoming_fields text[]
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  checked jsonb := '[]';
  item jsonb;
  item_field text;
  item_index integer;
  earlier jsonb;
  earlier_index integer;
begin
  if jsonb_typeof(value) is distinct from 'array' or jsonb_array_length(value) not between 1 and 10 then
    perform private.invalid_argument(field, format('%s must be a list of 1 to 10 %s.', field, noun));
  end if;

  for item_index in 0 .. jsonb_array_length(value) - 1 loop
    item_field := format('%s[%s]', field, item_index);
    item := private.checked_object(
      item_field,
      value -> item_index,
      array['ref', 'deck_id', 'expected_deck_revision', 'incoming', 'reason'],
      array['outgoing']
    );
    item := jsonb_set(
      item,
      '{incoming}',
      private.checked_object(item_field || '.incoming', item -> 'incoming', required_incoming_fields, optional_incoming_fields)
    );
    for earlier, earlier_index in
      select element, ordinality - 1 from jsonb_array_elements(checked) with ordinality as listed(element, ordinality)
    loop
      if earlier ->> 'ref' = item ->> 'ref' then
        perform private.invalid_argument(
          item_field || '.ref',
          format('%s.ref repeats the ref of %s[%s].', item_field, field, earlier_index)
        );
      end if;
      if earlier ->> 'deck_id' = item ->> 'deck_id' and earlier -> 'expected_deck_revision' <> item -> 'expected_deck_revision' then
        perform private.invalid_argument(
          item_field || '.expected_deck_revision',
          format('%s.expected_deck_revision must match %s[%s], which names the same deck.', item_field, field, earlier_index)
        );
      end if;
    end loop;
    checked := checked || jsonb_build_array(item);
  end loop;
  return checked;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_plan_items"(text, jsonb, text, text[], text[]) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."checked_plan_items"(text, jsonb, text, text[], text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_plan_items"(text, jsonb, text, text[], text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_plan_items"(text, jsonb, text, text[], text[]) TO "postgres";

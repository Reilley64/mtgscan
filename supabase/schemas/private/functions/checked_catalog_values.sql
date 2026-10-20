CREATE OR REPLACE FUNCTION private.checked_catalog_values (
  field      text,
  value      jsonb,
  value_kind text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  lowered jsonb;
  item_index bigint;
  item text;
  known boolean;
begin
  perform private.checked_text_list(field, value);
  lowered := (select jsonb_agg(lower(element)) from jsonb_array_elements_text(value) as element);
  perform private.checked_list(field, lowered, 1, 10);
  for item, item_index in
    select element, ordinality - 1 from jsonb_array_elements_text(lowered) with ordinality as e(element, ordinality)
  loop
    case value_kind
      when 'set' then
        known := exists (select 1 from public.card_printings p where p.set_code = item);
      when 'keyword' then
        known := exists (select 1 from public.cards c where private.keyword_keys(c.keywords) @> array[item]);
    end case;
    if not known then
      perform private.invalid_argument(
        format('%s[%s]', field, item_index),
        format('%s[%s] is not a known %s in the card catalog.', field, item_index, value_kind)
      );
    end if;
  end loop;
  return lowered;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_catalog_values"(text, jsonb, text) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_catalog_values"(text, jsonb, text) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_catalog_values"(text, jsonb, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_catalog_values"(text, jsonb, text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_catalog_values"(text, jsonb, text) TO "postgres";

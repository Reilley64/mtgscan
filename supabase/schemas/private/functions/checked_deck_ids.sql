CREATE OR REPLACE FUNCTION private.checked_deck_ids (
  field text,
  value jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  deck_ids jsonb;
  item_index bigint;
  item text;
begin
  deck_ids := private.checked_uuid_list(field, value, 10);
  for item, item_index in
    select element, ordinality - 1 from jsonb_array_elements_text(deck_ids) with ordinality as e(element, ordinality)
  loop
    if not exists (select 1 from public.decks deck where deck.id = item::uuid) then
      perform private.invalid_argument(
        format('%s[%s]', field, item_index),
        format('%s[%s] is not one of your decks.', field, item_index)
      );
    end if;
  end loop;
  return deck_ids;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."checked_deck_ids"(text, jsonb) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."checked_deck_ids"(text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "private"."checked_deck_ids"(text, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."checked_deck_ids"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."checked_deck_ids"(text, jsonb) TO "postgres";

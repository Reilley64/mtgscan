CREATE OR REPLACE FUNCTION private.resolved_plan_deck (
  owner_id   uuid,
  list_field text,
  item_index integer,
  checked    jsonb
)
  RETURNS public.decks
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  field text := format('%s[%s]', list_field, item_index);
  deck public.decks;
begin
  select * into deck from public.decks found_deck where found_deck.user_id = owner_id and found_deck.id = (checked ->> 'deck_id')::uuid;
  if deck.id is null then
    perform private.raise_search_error('not_found', format('%s.deck_id is not one of your decks.', field), field || '.deck_id');
  end if;
  if deck.revision <> (checked ->> 'expected_deck_revision')::integer then
    perform private.raise_search_error(
      'stale_revision',
      format('%s.expected_deck_revision is not the deck revision. Read the deck again.', field),
      jsonb_build_object(
        'pointer', format('/%s/%s/expected_deck_revision', list_field, item_index),
        'expected', (checked ->> 'expected_deck_revision')::integer,
        'current', deck.revision
      )::text
    );
  end if;
  return deck;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."resolved_plan_deck"(uuid, text, integer, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."resolved_plan_deck"(uuid, text, integer, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."resolved_plan_deck"(uuid, text, integer, jsonb) TO "postgres";

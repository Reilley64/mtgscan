CREATE OR REPLACE FUNCTION public.preview_revert (
  query jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  checked jsonb;
  deck public.decks;
  evaluation public.deck_evaluations;
  changes jsonb;
  reverted_contents jsonb;
begin
  caller := private.caller_user_id();
  checked := private.check_request(query, array['deck_id', 'deck_change_id']);

  select * into deck from public.decks found_deck where found_deck.id = (checked ->> 'deck_id')::uuid;
  if deck.id is null then
    perform private.raise_deck_not_found();
  end if;
  perform private.reverted_revision(caller, deck.id, (checked ->> 'deck_change_id')::uuid);
  changes := private.revert_effect(caller, (checked ->> 'deck_change_id')::uuid);
  select * into evaluation from public.deck_evaluations stored where stored.user_id = caller and stored.deck_id = deck.id;
  reverted_contents := private.reverted_deck_contents(private.deck_contents(caller, deck.id), changes);

  return jsonb_build_object(
    'revision', deck.revision,
    'lines', private.format_deck_change_lines(changes -> 'copy_lines', changes -> 'basic_land_lines'),
    'blocks', changes -> 'blocks',
    'protected_copies', changes -> 'protected_copies',
    'held_copies', changes -> 'held_copies',
    'effect', case
      when reverted_contents -> 'copies' <> '[]'::jsonb or reverted_contents -> 'basic_lands' <> '[]'::jsonb
        then private.deck_change_effect(evaluation, private.judge_deck(reverted_contents))
    end
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."preview_revert"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."preview_revert"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."preview_revert"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."preview_revert"(jsonb) FROM PUBLIC, "anon", "service_role";

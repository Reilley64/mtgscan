CREATE OR REPLACE FUNCTION public.remove_deck_card (
  request jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  checked jsonb;
  removed public.deck_cards;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['copy_id']);

  removed := private.lock_deck_card(caller, (checked ->> 'copy_id')::uuid);
  perform private.remove_from_deck(caller, removed, 'removed');

  return jsonb_build_object(
    'deck_id', removed.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = removed.deck_id)
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."remove_deck_card"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."remove_deck_card"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."remove_deck_card"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."remove_deck_card"(jsonb) FROM PUBLIC, "anon", "service_role";

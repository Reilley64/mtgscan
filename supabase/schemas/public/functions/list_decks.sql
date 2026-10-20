CREATE OR REPLACE FUNCTION public.list_decks (
  query jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
begin
  perform private.caller_user_id();
  perform private.check_request(query, array[]::text[]);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      private.deck_row(deck) || jsonb_build_object(
        'revision', deck.revision,
        'evaluation', (
          select jsonb_build_object('validity', evaluation.validity, 'estimated_bracket', evaluation.estimated_bracket)
            || private.deck_evaluation_staleness(evaluation)
          from public.deck_evaluations evaluation
          where evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
        ),
        'needs_you_count', (
          select count(*) from private.needs_you_items item where item.user_id = deck.user_id and item.deck_id = deck.id
        )
      )
      order by deck.last_used_at desc, lower(deck.name), deck.name, deck.id
    )
    from public.decks deck
  ), '[]'::jsonb));
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."list_decks"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_decks"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_decks"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_decks"(jsonb) FROM PUBLIC, "anon", "service_role";

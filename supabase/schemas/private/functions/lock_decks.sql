CREATE OR REPLACE FUNCTION private.lock_decks()
  RETURNS TABLE (
    user_id uuid,
    deck_id uuid
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  return query
    select deck.user_id, deck.id
    from public.decks deck
    order by deck.user_id, deck.id
    for update;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."lock_decks"() TO "deck_evaluator";

REVOKE ALL ON FUNCTION "private"."lock_decks"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."lock_decks"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."lock_decks"() TO "postgres";

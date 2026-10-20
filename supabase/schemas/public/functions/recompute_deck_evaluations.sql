CREATE OR REPLACE FUNCTION public.recompute_deck_evaluations()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  owner_id uuid;
  chosen_deck_id uuid;
  saved integer := 0;
begin
  for owner_id, chosen_deck_id in select locked.user_id, locked.deck_id from private.lock_decks() locked loop
    perform private.save_deck_evaluation(owner_id, chosen_deck_id);
    saved := saved + (
      select count(*)::integer
      from public.deck_evaluations evaluation
      where evaluation.user_id = owner_id and evaluation.deck_id = chosen_deck_id
    );
  end loop;
  return saved;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."recompute_deck_evaluations"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."recompute_deck_evaluations"() FROM "deck_evaluator";

GRANT EXECUTE ON FUNCTION "public"."recompute_deck_evaluations"() TO "deck_evaluator";

ALTER FUNCTION "public"."recompute_deck_evaluations"() OWNER TO "deck_evaluator";

REVOKE ALL ON FUNCTION "public"."recompute_deck_evaluations"() FROM PUBLIC, "anon", "authenticated";

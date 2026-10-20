CREATE OR REPLACE FUNCTION public.deck_evaluations_are_behind()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from public.deck_evaluations evaluation
    cross join lateral private.rules_data_behind(evaluation) behind
  );
$function$;

GRANT EXECUTE ON FUNCTION "public"."deck_evaluations_are_behind"() TO "service_role";

REVOKE ALL ON FUNCTION "public"."deck_evaluations_are_behind"() FROM "deck_evaluator";

GRANT EXECUTE ON FUNCTION "public"."deck_evaluations_are_behind"() TO "deck_evaluator";

ALTER FUNCTION "public"."deck_evaluations_are_behind"() OWNER TO "deck_evaluator";

REVOKE ALL ON FUNCTION "public"."deck_evaluations_are_behind"() FROM PUBLIC, "anon", "authenticated";

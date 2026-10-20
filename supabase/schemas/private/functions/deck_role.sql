CREATE OR REPLACE FUNCTION private.deck_role (
  commander_at timestamp with time zone
)
  RETURNS public.deck_role
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select case when commander_at is null then 'main' else 'commander' end::public.deck_role;
$function$;

GRANT EXECUTE ON FUNCTION "private"."deck_role"(timestamp WITH time zone) TO "authenticated", "deck_evaluator";

REVOKE ALL ON FUNCTION "private"."deck_role"(timestamp WITH time zone) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."deck_role"(timestamp WITH time zone) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."deck_role"(timestamp WITH time zone) TO "postgres";

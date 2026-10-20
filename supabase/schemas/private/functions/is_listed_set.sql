CREATE OR REPLACE FUNCTION private.is_listed_set (
  card_set public.card_sets
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select card_set.released_at <= current_date
    and exists (
      select 1 from public.card_printings p where p.set_code = card_set.code and p.absent_since is null
    );
$function$;

GRANT EXECUTE ON FUNCTION "private"."is_listed_set"(public.card_sets) TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."is_listed_set"(public.card_sets) TO "service_role";

REVOKE ALL ON FUNCTION "private"."is_listed_set"(public.card_sets) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."is_listed_set"(public.card_sets) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."is_listed_set"(public.card_sets) TO "postgres";

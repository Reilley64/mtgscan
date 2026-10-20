CREATE OR REPLACE FUNCTION public.get_needs_you_counts (
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
  return jsonb_build_object(
    'total', (select count(*) from private.needs_you_items),
    'decks', coalesce((
      select jsonb_agg(jsonb_build_object('deck_id', item.deck_id, 'count', item.count) order by item.deck_id)
      from (select deck_id, count(*) as count from private.needs_you_items group by deck_id) item
    ), '[]'::jsonb)
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_needs_you_counts"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_needs_you_counts"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_needs_you_counts"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_needs_you_counts"(jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.swap_in_planned_swap (
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
  swap public.planned_swaps;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['planned_swap_id']);
  swap := private.locked_planned_swap(caller, (checked ->> 'planned_swap_id')::uuid, array['open']::public.planned_swap_status[]);
  perform private.swap_in(caller, swap, 'planned_swap_id');

  return jsonb_build_object(
    'deck_id', swap.deck_id,
    'revision', (select deck.revision from public.decks deck where deck.user_id = caller and deck.id = swap.deck_id)
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."swap_in_planned_swap"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."swap_in_planned_swap"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."swap_in_planned_swap"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."swap_in_planned_swap"(jsonb) FROM PUBLIC, "anon", "service_role";

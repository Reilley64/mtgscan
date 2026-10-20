CREATE OR REPLACE FUNCTION public.rename_deck (
  request jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  checked jsonb;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['deck_id', 'name']);

  update public.decks deck
    set name = checked ->> 'name', last_used_at = now()
    where deck.user_id = caller and deck.id = (checked ->> 'deck_id')::uuid;
  if not found then
    perform private.raise_deck_not_found();
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."rename_deck"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."rename_deck"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."rename_deck"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."rename_deck"(jsonb) FROM PUBLIC, "anon", "service_role";

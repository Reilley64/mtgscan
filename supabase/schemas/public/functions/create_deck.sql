CREATE OR REPLACE FUNCTION public.create_deck (
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
  created_id uuid;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  checked := private.check_request(request, array['name']);

  insert into public.decks (user_id, name)
    values (caller, checked ->> 'name')
    returning id into created_id;

  return jsonb_build_object('deck_id', created_id);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_deck"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."create_deck"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."create_deck"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."create_deck"(jsonb) FROM PUBLIC, "anon", "service_role";

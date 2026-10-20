CREATE OR REPLACE FUNCTION public.mcp_set_copies_user_tag (
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
  chosen_copy_ids uuid[];
  found_copy_ids uuid[];
begin
  caller := private.caller_user_id();
  perform private.caller_ai_client();
  checked := private.check_request(request, array['copy_ids', 'user_tag_id', 'tagged']);
  chosen_copy_ids := array(select jsonb_array_elements_text(checked -> 'copy_ids')::uuid);

  found_copy_ids := private.set_copies_user_tag(
    caller,
    (checked ->> 'user_tag_id')::uuid,
    chosen_copy_ids,
    (checked ->> 'tagged')::boolean
  );
  return (
    select jsonb_build_object(
      'changed', coalesce(jsonb_agg(chosen.copy_id order by chosen.position) filter (where chosen.copy_id = any (found_copy_ids)), '[]'),
      'skipped', coalesce(
        jsonb_agg(jsonb_build_object('copy_id', chosen.copy_id, 'reason', 'missing') order by chosen.position)
          filter (where chosen.copy_id <> all (found_copy_ids)),
        '[]'
      )
    )
    from unnest(chosen_copy_ids) with ordinality chosen(copy_id, position)
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."mcp_set_copies_user_tag"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."mcp_set_copies_user_tag"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."mcp_set_copies_user_tag"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."mcp_set_copies_user_tag"(jsonb) FROM PUBLIC, "anon", "service_role";

CREATE OR REPLACE FUNCTION public.set_training_crop_uploads (
  request jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  caller uuid;
  uploads_on boolean;
begin
  caller := private.caller_user_id();
  perform private.refuse_mcp_token();
  uploads_on := (private.check_request(request, array['on']) ->> 'on')::boolean;

  update public.profiles p
    set training_crop_uploads = uploads_on
    where p.user_id = caller;

  return jsonb_build_object('uploads_on', uploads_on);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."set_training_crop_uploads"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."set_training_crop_uploads"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."set_training_crop_uploads"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."set_training_crop_uploads"(jsonb) FROM PUBLIC, "anon", "service_role";

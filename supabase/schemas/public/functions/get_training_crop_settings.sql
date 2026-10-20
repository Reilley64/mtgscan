CREATE OR REPLACE FUNCTION public.get_training_crop_settings (
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
  return (select jsonb_build_object('uploads_on', p.training_crop_uploads) from public.profiles p);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_training_crop_settings"(jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "public"."get_training_crop_settings"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_training_crop_settings"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_training_crop_settings"(jsonb) FROM PUBLIC, "anon", "service_role";

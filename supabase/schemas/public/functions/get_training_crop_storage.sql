CREATE OR REPLACE FUNCTION public.get_training_crop_storage (
  query jsonb DEFAULT '{}'::jsonb
)
  RETURNS jsonb
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  perform private.check_request(query, array[]::text[]);
  return jsonb_build_object('bytes_left', private.storage_left_before_upload_stop());
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."get_training_crop_storage"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."get_training_crop_storage"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."get_training_crop_storage"(jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."get_training_crop_storage"(jsonb) FROM PUBLIC, "anon", "authenticated";

CREATE OR REPLACE FUNCTION public.record_gallery_version (
  version  text,
  manifest jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if jsonb_typeof(record_gallery_version.manifest) is distinct from 'object'
    or record_gallery_version.manifest ->> 'version' is distinct from record_gallery_version.version then
    perform private.invalid_argument('manifest', 'manifest must be an object that names the same version.');
  end if;
  begin
    insert into public.gallery_versions (version, manifest)
      values (record_gallery_version.version, record_gallery_version.manifest)
      on conflict do nothing;
  exception when check_violation then
    perform private.invalid_argument('version', 'version must be a build date and a 6-character ID, such as 20261021-a1b2c3.');
  end;
  if not found then
    perform private.invalid_argument('version', format('Gallery version %s is already recorded.', record_gallery_version.version));
  end if;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_gallery_version"(text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_gallery_version"(text, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_gallery_version"(text, jsonb) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_gallery_version"(text, jsonb) FROM PUBLIC, "anon", "authenticated";

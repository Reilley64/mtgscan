CREATE OR REPLACE FUNCTION public.delete_gallery_version (
  version text
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  recorded public.gallery_versions;
begin
  recorded := private.gallery_version(delete_gallery_version.version);
  if recorded.published_at is not null and recorded.published_at = (
    select max(v.published_at) from public.gallery_versions v
  ) then
    perform private.invalid_argument('version', format('Gallery version %s is the published version.', recorded.version));
  end if;
  delete from public.gallery_versions v where v.version = recorded.version;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."delete_gallery_version"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."delete_gallery_version"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."delete_gallery_version"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."delete_gallery_version"(text) FROM PUBLIC, "anon", "authenticated";

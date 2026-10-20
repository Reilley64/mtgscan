CREATE OR REPLACE FUNCTION private.gallery_version (
  version text
)
  RETURNS public.gallery_versions
  LANGUAGE plpgsql
  STABLE
  SET search_path TO ''
  AS $function$
declare
  found_version public.gallery_versions;
begin
  select * into found_version from public.gallery_versions v where v.version = gallery_version.version;
  if not found then
    perform private.raise_search_error(
      'unknown_gallery_version',
      format('Gallery version %s is not recorded.', gallery_version.version),
      'version'
    );
  end if;
  return found_version;
end;
$function$;

REVOKE ALL ON FUNCTION "private"."gallery_version"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."gallery_version"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."gallery_version"(text) TO "postgres";

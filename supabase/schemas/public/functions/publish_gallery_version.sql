CREATE OR REPLACE FUNCTION public.publish_gallery_version (
  version text
)
  RETURNS timestamp WITH time zone
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  recorded public.gallery_versions;
  published timestamptz := now();
begin
  recorded := private.gallery_version(publish_gallery_version.version);
  if recorded.parity_checked_at is null then
    perform private.raise_search_error(
      'parity_missing',
      format('Gallery version %s has no recorded parity check. Run the parity check on the iPhone first.', recorded.version),
      'version'
    );
  end if;
  if not private.gallery_parity_passed(recorded) then
    perform private.raise_search_error(
      'parity_failed',
      format(
        'The parity check of gallery version %s did not pass: the lowest cosine is %s over %s references. It must be at least 0.98 over 24 or more.',
        recorded.version,
        recorded.parity_lowest_cosine,
        recorded.parity_references
      ),
      'version'
    );
  end if;
  update public.gallery_versions v set published_at = published where v.version = recorded.version;
  return published;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."publish_gallery_version"(text) TO "service_role";

REVOKE ALL ON FUNCTION "public"."publish_gallery_version"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."publish_gallery_version"(text) TO "postgres";

REVOKE ALL ON FUNCTION "public"."publish_gallery_version"(text) FROM PUBLIC, "anon", "authenticated";

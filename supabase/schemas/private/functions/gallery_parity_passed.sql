CREATE OR REPLACE FUNCTION private.gallery_parity_passed (
  recorded public.gallery_versions
)
  RETURNS boolean
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select coalesce(recorded.parity_lowest_cosine >= 0.98 and recorded.parity_references >= 24, false);
$function$;

REVOKE ALL ON FUNCTION "private"."gallery_parity_passed"(public.gallery_versions) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."gallery_parity_passed"(public.gallery_versions) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."gallery_parity_passed"(public.gallery_versions) TO "postgres";

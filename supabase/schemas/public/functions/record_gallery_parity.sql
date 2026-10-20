CREATE OR REPLACE FUNCTION public.record_gallery_parity (
  version         text,
  lowest_cosine   double precision,
  mean_cosine     double precision,
  reference_count integer
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  recorded public.gallery_versions;
begin
  perform private.gallery_version(record_gallery_parity.version);
  if record_gallery_parity.lowest_cosine is null or record_gallery_parity.lowest_cosine not between -1 and 1 then
    perform private.invalid_argument('lowest_cosine', 'lowest_cosine must be a number from -1 to 1.');
  end if;
  if record_gallery_parity.mean_cosine is null
    or record_gallery_parity.mean_cosine not between record_gallery_parity.lowest_cosine and 1.001 then
    perform private.invalid_argument('mean_cosine', 'mean_cosine must be a number from lowest_cosine to 1.001.');
  end if;
  if record_gallery_parity.reference_count is null or record_gallery_parity.reference_count < 1 then
    perform private.invalid_argument('reference_count', 'reference_count must be a whole number of 1 or more.');
  end if;
  update public.gallery_versions v
    set parity_lowest_cosine = record_gallery_parity.lowest_cosine,
      parity_mean_cosine = record_gallery_parity.mean_cosine,
      parity_references = record_gallery_parity.reference_count,
      parity_checked_at = now()
    where v.version = record_gallery_parity.version
    returning * into recorded;
  return private.gallery_parity_passed(recorded);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_gallery_parity"(text, double precision, double precision, integer) TO "service_role";

REVOKE ALL ON FUNCTION "public"."record_gallery_parity"(text, double precision, double precision, integer) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."record_gallery_parity"(text, double precision, double precision, integer) TO "postgres";

REVOKE ALL ON FUNCTION "public"."record_gallery_parity"(text, double precision, double precision, integer) FROM PUBLIC, "anon", "authenticated";

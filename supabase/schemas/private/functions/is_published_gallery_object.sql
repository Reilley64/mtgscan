CREATE OR REPLACE FUNCTION private.is_published_gallery_object (
  object_name text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select object_name = 'published.json'
    or exists (
      select 1
      from public.gallery_versions v
      where v.published_at is not null
        and v.version = split_part(object_name, '/', 1)
        and object_name like v.version || '/_%'
    );
$function$;

GRANT EXECUTE ON FUNCTION "private"."is_published_gallery_object"(text) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."is_published_gallery_object"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."is_published_gallery_object"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."is_published_gallery_object"(text) TO "postgres";

CREATE OR REPLACE FUNCTION public.list_gallery_printings (
  after_id uuid DEFAULT NULL::uuid
)
  RETURNS TABLE (
    id         uuid,
    basic_land boolean
  )
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select p.id, private.some_face_has_type_words(c.type_line, array['basic'])
  from public.card_printings p
  join public.cards c on c.oracle_id = p.oracle_id
  where p.absent_since is null
    and (after_id is null or p.id > after_id)
  order by p.id
  limit 1000;
$function$;

GRANT EXECUTE ON FUNCTION "public"."list_gallery_printings"(uuid) TO "service_role";

REVOKE ALL ON FUNCTION "public"."list_gallery_printings"(uuid) FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_gallery_printings"(uuid) TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_gallery_printings"(uuid) FROM PUBLIC, "anon", "authenticated";

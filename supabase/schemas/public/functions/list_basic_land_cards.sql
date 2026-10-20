CREATE OR REPLACE FUNCTION public.list_basic_land_cards()
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object('items', coalesce(jsonb_agg(
    jsonb_build_object(
      'oracle_id', land.oracle_id,
      'name', land.name,
      'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb)
    )
    order by land.kind_order
  ), '[]'::jsonb))
  from private.basic_land_cards() land
  where land.oracle_id is not null;
$function$;

GRANT EXECUTE ON FUNCTION "public"."list_basic_land_cards"() TO "authenticated";

REVOKE ALL ON FUNCTION "public"."list_basic_land_cards"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "public"."list_basic_land_cards"() TO "postgres";

REVOKE ALL ON FUNCTION "public"."list_basic_land_cards"() FROM PUBLIC, "anon", "service_role";

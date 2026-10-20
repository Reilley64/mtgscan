CREATE OR REPLACE FUNCTION private.basic_land_kinds()
  RETURNS TABLE (
    kind_order integer,
    name       text
  )
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select kind.kind_order::integer, kind.name
  from unnest(array[
    'Plains',
    'Island',
    'Swamp',
    'Mountain',
    'Forest',
    'Wastes',
    'Snow-Covered Plains',
    'Snow-Covered Island',
    'Snow-Covered Swamp',
    'Snow-Covered Mountain',
    'Snow-Covered Forest',
    'Snow-Covered Wastes'
  ]) with ordinality as kind(name, kind_order);
$function$;

GRANT EXECUTE ON FUNCTION "private"."basic_land_kinds"() TO "authenticated";

GRANT EXECUTE ON FUNCTION "private"."basic_land_kinds"() TO "service_role";

REVOKE ALL ON FUNCTION "private"."basic_land_kinds"() FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."basic_land_kinds"() FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."basic_land_kinds"() TO "postgres";

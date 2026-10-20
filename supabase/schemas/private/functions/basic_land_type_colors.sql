CREATE OR REPLACE FUNCTION private.basic_land_type_colors (
  type_line text
)
  RETURNS text[]
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  select coalesce(array_agg(land_type.color order by land_type.color), '{}')
  from (values ('Plains', 'W'), ('Island', 'U'), ('Swamp', 'B'), ('Mountain', 'R'), ('Forest', 'G')) as land_type(name, color)
  where private.has_subtype(type_line, land_type.name);
$function$;

REVOKE ALL ON FUNCTION "private"."basic_land_type_colors"(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."basic_land_type_colors"(text) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."basic_land_type_colors"(text) TO "postgres";

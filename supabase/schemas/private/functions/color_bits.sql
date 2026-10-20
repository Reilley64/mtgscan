CREATE OR REPLACE FUNCTION private.color_bits (
  colors text[]
)
  RETURNS smallint
  LANGUAGE sql
  IMMUTABLE
  PARALLEL SAFE
  SET search_path TO ''
  AS $function$
  select coalesce(sum(distinct case color
    when 'W' then 1
    when 'U' then 2
    when 'B' then 4
    when 'R' then 8
    when 'G' then 16
    else 0
  end), 0)::smallint
  from unnest(colors) as color;
$function$;

GRANT EXECUTE ON FUNCTION "private"."color_bits"(text[]) TO "authenticated", "catalog_importer";

GRANT EXECUTE ON FUNCTION "private"."color_bits"(text[]) TO "service_role";

REVOKE ALL ON FUNCTION "private"."color_bits"(text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."color_bits"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."color_bits"(text[]) TO "postgres";

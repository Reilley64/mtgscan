CREATE OR REPLACE FUNCTION private.color_names (
  colors text[]
)
  RETURNS text
  LANGUAGE sql
  IMMUTABLE
  SET search_path TO ''
  AS $function$
  with canonical as (
    select order_letters.letters
    from unnest(array[
      'W', 'U', 'B', 'R', 'G',
      'WU', 'UB', 'BR', 'RG', 'GW', 'WB', 'UR', 'BG', 'RW', 'GU',
      'WUB', 'UBR', 'BRG', 'RGW', 'GWU', 'WBG', 'URW', 'BGU', 'RWB', 'GUR',
      'WUBR', 'UBRG', 'BRGW', 'RGWU', 'GWUB',
      'WUBRG'
    ]) as order_letters(letters)
    where (select array_agg(letter order by letter) from regexp_split_to_table(order_letters.letters, '') letter)
      = (select array_agg(color order by color) from unnest(colors) color)
  ),
  named as (
    select
      case letter.color when 'W' then 'White' when 'U' then 'Blue' when 'B' then 'Black' when 'R' then 'Red' when 'G' then 'Green' end as name,
      letter.position
    from canonical, regexp_split_to_table(canonical.letters, '') with ordinality as letter(color, position)
  )
  select case cardinality(colors)
    when 0 then 'colorless'
    when 1 then (select named.name from named)
    when 2 then (select string_agg(named.name, ' and ' order by named.position) from named)
    else (select string_agg(named.name, ', ' order by named.position) filter (where named.position < cardinality(colors)) from named)
      || ', and ' || (select named.name from named where named.position = cardinality(colors))
  end;
$function$;

REVOKE ALL ON FUNCTION "private"."color_names"(text[]) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."color_names"(text[]) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."color_names"(text[]) TO "postgres";

CREATE OR REPLACE FUNCTION public.import_card_sets (
  sets jsonb
)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  imported integer;
begin
  if jsonb_typeof(sets) is distinct from 'array' or jsonb_array_length(sets) = 0 then
    raise exception 'The sets must be a non-empty JSON array.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(sets) as entry(value)
    where jsonb_typeof(entry.value -> 'code') is distinct from 'string'
      or jsonb_typeof(entry.value -> 'name') is distinct from 'string'
      or jsonb_typeof(entry.value -> 'icon_svg_uri') is distinct from 'string'
  ) then
    raise exception 'Every set needs a code, a name, and an icon_svg_uri.' using errcode = '22023';
  end if;

  insert into public.card_sets as live (code, name, icon_svg_uri, set_type, released_at)
  select distinct on (entry.value ->> 'code')
    entry.value ->> 'code',
    entry.value ->> 'name',
    entry.value ->> 'icon_svg_uri',
    entry.value ->> 'set_type',
    (entry.value ->> 'released_at')::date
  from jsonb_array_elements(sets) as entry(value)
  order by entry.value ->> 'code'
  on conflict (code) do update
    set name = excluded.name,
      icon_svg_uri = excluded.icon_svg_uri,
      set_type = excluded.set_type,
      released_at = excluded.released_at
    where (live.name, live.icon_svg_uri, live.set_type, live.released_at)
      is distinct from (excluded.name, excluded.icon_svg_uri, excluded.set_type, excluded.released_at);

  get diagnostics imported = row_count;
  return imported;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."import_card_sets"(jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."import_card_sets"(jsonb) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "public"."import_card_sets"(jsonb) TO "catalog_importer";

ALTER FUNCTION "public"."import_card_sets"(jsonb) OWNER TO "catalog_importer";

REVOKE ALL ON FUNCTION "public"."import_card_sets"(jsonb) FROM PUBLIC, "anon", "authenticated";

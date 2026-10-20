CREATE OR REPLACE FUNCTION public.import_set_sections (
  set_code text,
  sections jsonb
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not exists (select 1 from public.card_sets card_set where card_set.code = import_set_sections.set_code) then
    raise exception 'No card set has the code %.', import_set_sections.set_code using errcode = '22023';
  end if;

  delete from public.set_sections section where section.set_code = import_set_sections.set_code;

  insert into public.set_sections (set_code, position, name, search)
  select import_set_sections.set_code, entry.position, entry.value ->> 'name', entry.value ->> 'search'
  from jsonb_array_elements(sections) with ordinality as entry(value, position);

  insert into public.set_section_card_printings (set_code, position, card_printing_id)
  select distinct import_set_sections.set_code, entry.position, p.id
  from jsonb_array_elements(sections) with ordinality as entry(value, position)
  cross join jsonb_array_elements_text(entry.value -> 'card_printing_ids') as listed(card_printing_id)
  join public.card_printings p on p.id = listed.card_printing_id::uuid;

  update public.card_sets card_set
    set set_sections_read_at = now()
    where card_set.code = import_set_sections.set_code;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."import_set_sections"(text, jsonb) TO "service_role";

REVOKE ALL ON FUNCTION "public"."import_set_sections"(text, jsonb) FROM "catalog_importer";

GRANT EXECUTE ON FUNCTION "public"."import_set_sections"(text, jsonb) TO "catalog_importer";

ALTER FUNCTION "public"."import_set_sections"(text, jsonb) OWNER TO "catalog_importer";

REVOKE ALL ON FUNCTION "public"."import_set_sections"(text, jsonb) FROM PUBLIC, "anon", "authenticated";

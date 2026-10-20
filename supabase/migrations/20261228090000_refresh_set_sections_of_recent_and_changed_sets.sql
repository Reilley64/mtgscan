drop function public.sets_for_set_section_import();

create function public.sets_for_set_section_import()
returns table (code text, due boolean, sections jsonb, has_unlisted_card_printing boolean)
language sql
stable
set search_path = ''
as $$
  with listed_set as (
    select card_set.code, card_set.released_at, card_set.set_sections_read_at
    from public.card_sets card_set
    where private.is_listed_set(card_set)
  ),
  set_with_unlisted_card_printing as (
    select distinct printing.set_code
    from private.set_card_printings(array(select listed_set.code from listed_set)) printing
    where not exists (
      select 1
      from public.set_section_card_printings listed
      where listed.set_code = printing.set_code and listed.card_printing_id = printing.card_printing_id
    )
  )
  select
    listed_set.code,
    listed_set.set_sections_read_at is null
      or listed_set.released_at >= current_date - 180
      or unlisted.set_code is not null,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object('name', section.name, 'search', section.search) order by section.position)
        from public.set_sections section
        where section.set_code = listed_set.code
      ),
      '[]'::jsonb
    ),
    unlisted.set_code is not null
  from listed_set
  left join set_with_unlisted_card_printing unlisted on unlisted.set_code = listed_set.code
  order by listed_set.code;
$$;

grant execute on function private.set_card_printings(text[]) to service_role;
grant execute on function private.basic_land_cards() to service_role;
grant execute on function private.basic_land_kinds() to service_role;
grant execute on function private.default_printing_id(uuid) to service_role;
grant execute on function private.name_key(text) to service_role;

revoke all on function public.sets_for_set_section_import() from public, anon, authenticated;
grant execute on function public.sets_for_set_section_import() to service_role;

create function public.record_set_sections_read(set_code text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.card_sets card_set
    set set_sections_read_at = now()
    where card_set.code = record_set_sections_read.set_code;
$$;

grant create on schema public to catalog_importer;
alter function public.record_set_sections_read(text) owner to catalog_importer;
revoke create on schema public from catalog_importer;

revoke all on function public.record_set_sections_read(text) from public, anon, authenticated;
grant execute on function public.record_set_sections_read(text) to service_role;

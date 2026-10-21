create or replace function public.sets_for_set_section_import()
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
    from private.set_card_printings(
      array(
        select listed_set.code
        from listed_set
        where exists (select 1 from public.set_sections section where section.set_code = listed_set.code)
      )
    ) printing
    where not private.is_in_a_set_section(printing.set_code, printing.card_printing_id)
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

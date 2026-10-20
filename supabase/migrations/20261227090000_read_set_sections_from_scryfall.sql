create function public.sets_for_set_section_import()
returns table (code text, due boolean)
language sql
stable
set search_path = ''
as $$
  select card_set.code, card_set.set_sections_read_at is null
  from public.card_sets card_set
  where private.is_listed_set(card_set)
  order by card_set.code;
$$;

grant execute on function private.is_listed_set(public.card_sets) to service_role;

revoke all on function public.sets_for_set_section_import() from public, anon, authenticated;
grant execute on function public.sets_for_set_section_import() to service_role;

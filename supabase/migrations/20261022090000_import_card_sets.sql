create table public.card_sets (
  code text primary key,
  name text not null,
  icon_svg_uri text not null
);

alter table public.card_sets enable row level security;

revoke all on table public.card_sets from anon, authenticated;
grant select on table public.card_sets to authenticated;
grant select, insert, update on table public.card_sets to catalog_importer;

create policy "Signed-in users read card sets"
  on public.card_sets
  for select
  to authenticated
  using (true);

create policy "The import role writes card sets"
  on public.card_sets
  for all
  to catalog_importer
  using (true)
  with check (true);

create function public.import_card_sets(sets jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
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

  insert into public.card_sets as live (code, name, icon_svg_uri)
  select distinct on (entry.value ->> 'code')
    entry.value ->> 'code', entry.value ->> 'name', entry.value ->> 'icon_svg_uri'
  from jsonb_array_elements(sets) as entry(value)
  order by entry.value ->> 'code'
  on conflict (code) do update
    set name = excluded.name, icon_svg_uri = excluded.icon_svg_uri
    where (live.name, live.icon_svg_uri) is distinct from (excluded.name, excluded.icon_svg_uri);

  get diagnostics imported = row_count;
  return imported;
end;
$$;

grant create on schema public to catalog_importer;
alter function public.import_card_sets(jsonb) owner to catalog_importer;
revoke create on schema public from catalog_importer;

revoke all on function public.import_card_sets(jsonb) from public, anon, authenticated;
grant execute on function public.import_card_sets(jsonb) to service_role;

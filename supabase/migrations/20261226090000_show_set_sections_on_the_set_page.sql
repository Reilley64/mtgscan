create table public.set_sections (
  set_code text not null references public.card_sets (code),
  position integer not null,
  name text not null,
  search text not null,
  primary key (set_code, position)
);

create table public.set_section_card_printings (
  set_code text not null,
  position integer not null,
  card_printing_id uuid not null references public.card_printings (id),
  primary key (set_code, position, card_printing_id),
  foreign key (set_code, position) references public.set_sections (set_code, position) on delete cascade
);

create index set_section_card_printings_card_printing_id on public.set_section_card_printings (card_printing_id);

alter table public.card_sets add column set_sections_read_at timestamptz;

alter table public.set_sections enable row level security;
alter table public.set_section_card_printings enable row level security;

revoke all on table public.set_sections, public.set_section_card_printings from anon, authenticated;
grant select on table public.set_sections, public.set_section_card_printings to authenticated;
grant select, insert, update, delete on table public.set_sections, public.set_section_card_printings to catalog_importer;

create policy "Signed-in users read set sections"
  on public.set_sections
  for select
  to authenticated
  using (true);

create policy "Signed-in users read set section card printings"
  on public.set_section_card_printings
  for select
  to authenticated
  using (true);

create policy "The import role writes set sections"
  on public.set_sections
  for all
  to catalog_importer
  using (true)
  with check (true);

create policy "The import role writes set section card printings"
  on public.set_section_card_printings
  for all
  to catalog_importer
  using (true)
  with check (true);

create or replace function public.get_set(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  card_set public.card_sets;
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_set_query(query);
  select * into card_set
  from public.card_sets listed_set
  where listed_set.code = checked ->> 'code' and private.is_listed_set(listed_set);
  if card_set.code is null then
    perform private.raise_search_error('not_found', 'code is not a released set in the card catalog.', 'code');
  end if;

  with printing as (
    select
      counts.card_printing_id,
      counts.in_main_set,
      counts.counts,
      private.collector_number_order(p.collector_number) as collector_number_order,
      jsonb_build_object(
        'printing_id', p.id,
        'name', c.name,
        'collector_number', p.collector_number,
        'image_uri', p.image_uris[1],
        'finishes', to_jsonb(p.finishes),
        'counts', counts.counts
      ) as row,
      exists (
        select 1
        from public.set_section_card_printings listed
        where listed.set_code = card_set.code and listed.card_printing_id = counts.card_printing_id
      ) as in_a_set_section
    from private.set_card_printing_counts(array[card_set.code]) counts
    join public.card_printings p on p.id = counts.card_printing_id
    join public.cards c on c.oracle_id = p.oracle_id
  ),
  set_section as (
    select
      section.position,
      jsonb_build_object(
        'name', section.name,
        'completion', private.set_completion(array_agg(printing.counts)),
        'card_printings', jsonb_agg(printing.row order by printing.collector_number_order)
      ) as row
    from public.set_sections section
    join public.set_section_card_printings listed
      on listed.set_code = section.set_code and listed.position = section.position
    join printing on printing.card_printing_id = listed.card_printing_id
    where section.set_code = card_set.code
    group by section.position, section.name
  )
  select
    private.set_row(
      card_set,
      (select art.set_art_uri from private.set_art_uris(array[card_set.code]) art),
      private.set_completion(array_agg(printing.counts) filter (where printing.in_main_set))
    )
    || jsonb_build_object(
      'sections', coalesce((select jsonb_agg(set_section.row order by set_section.position) from set_section), '[]'::jsonb),
      'other', jsonb_build_object(
        'completion', private.set_completion(array_agg(printing.counts) filter (where not printing.in_a_set_section)),
        'card_printings', coalesce(
          jsonb_agg(printing.row order by printing.collector_number_order)
            filter (where not printing.in_a_set_section),
          '[]'::jsonb
        )
      )
    )
  into result
  from printing;
  return result;
end;
$$;

create function public.import_set_sections(set_code text, sections jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.card_sets card_set where card_set.code = import_set_sections.set_code) then
    raise exception 'No card set has the code %.', import_set_sections.set_code using errcode = '22023';
  end if;
  if jsonb_typeof(sections) is distinct from 'array' or exists (
    select 1
    from jsonb_array_elements(sections) as entry(value)
    where jsonb_typeof(entry.value -> 'name') is distinct from 'string'
      or jsonb_typeof(entry.value -> 'search') is distinct from 'string'
      or jsonb_typeof(entry.value -> 'card_printing_ids') is distinct from 'array'
  ) then
    raise exception 'The sections must be a JSON array, and every set section needs a name, a search, and card_printing_ids.'
      using errcode = '22023';
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
$$;

grant create on schema public to catalog_importer;
alter function public.import_set_sections(text, jsonb) owner to catalog_importer;
revoke create on schema public from catalog_importer;

revoke all on function public.import_set_sections(text, jsonb) from public, anon, authenticated;
grant execute on function public.import_set_sections(text, jsonb) to service_role;

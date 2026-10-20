create function private.is_in_a_set_section(set_code text, card_printing_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.set_section_card_printings listed
    where listed.set_code = is_in_a_set_section.set_code and listed.card_printing_id = is_in_a_set_section.card_printing_id
  );
$$;

grant execute on function private.is_in_a_set_section(text, uuid) to authenticated, service_role;

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
      private.is_in_a_set_section(card_set.code, counts.card_printing_id) as in_a_set_section
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

create or replace function public.import_set_sections(set_code text, sections jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

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
    from private.set_card_printings(array(select listed_set.code from listed_set)) printing
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

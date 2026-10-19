create or replace function private.set_card_printing_counts(set_codes text[])
returns table (set_code text, card_printing_id uuid, in_main_set boolean, counts jsonb)
language sql
stable
set search_path = ''
as $$
  select
    printing.set_code,
    printing.card_printing_id,
    printing.in_main_set,
    jsonb_build_object(
      'any', owned.copies,
      'nonfoil', case
        when 'nonfoil' = any (p.finishes) then owned.nonfoil_copies
        else owned.copies
      end,
      'foil', case
        when p.finishes && array['foil', 'etched']::public.card_finish[] then owned.foil_copies
      end
    )
  from private.set_card_printings(set_codes) printing
  join public.card_printings p on p.id = printing.card_printing_id
  cross join lateral (
    select
      count(*) as copies,
      count(*) filter (where copy.finish = 'nonfoil') as nonfoil_copies,
      count(*) filter (where copy.finish in ('foil', 'etched')) as foil_copies
    from public.copies copy
    where copy.card_printing_id = printing.card_printing_id
  ) owned;
$$;

create function private.set_art_uris(set_codes text[])
returns table (set_code text, set_art_uri text)
language sql
stable
set search_path = ''
as $$
  select distinct on (printing.set_code) printing.set_code, p.art_crop_uri
  from private.set_card_printings(set_codes) printing
  join public.card_printings p on p.id = printing.card_printing_id
  left join public.card_prices price on price.printing_id = p.id
  where p.art_crop_uri is not null
  order by
    printing.set_code,
    greatest(price.usd_nonfoil_cents, price.usd_foil_cents, price.usd_etched_cents) desc nulls last,
    private.collector_number_order(p.collector_number);
$$;

drop function private.set_row(public.card_sets, jsonb);
drop function private.set_art_uri(text);

create function private.set_row(card_set public.card_sets, set_art_uri text, completion jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'code', card_set.code,
    'name', card_set.name,
    'icon_svg_uri', card_set.icon_svg_uri,
    'released_at', card_set.released_at,
    'set_art_uri', set_art_uri,
    'completion', completion
  );
$$;

drop function private.listed_sets();

create function private.is_listed_set(card_set public.card_sets)
returns boolean
language sql
stable
set search_path = ''
as $$
  select card_set.released_at <= current_date
    and exists (
      select 1 from public.card_printings p where p.set_code = card_set.code and p.absent_since is null
    );
$$;

create index card_sets_newest_first on public.card_sets (released_at desc, name, code);

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
      ) as row
    from private.set_card_printing_counts(array[card_set.code]) counts
    join public.card_printings p on p.id = counts.card_printing_id
    join public.cards c on c.oracle_id = p.oracle_id
  )
  select
    private.set_row(
      card_set,
      (select art.set_art_uri from private.set_art_uris(array[card_set.code]) art),
      private.set_completion(array_agg(printing.counts) filter (where printing.in_main_set))
    )
    || jsonb_build_object(
      'main_set', coalesce(
        jsonb_agg(printing.row order by printing.collector_number_order)
          filter (where printing.in_main_set),
        '[]'::jsonb
      ),
      'variants', jsonb_build_object(
        'completion', private.set_completion(array_agg(printing.counts) filter (where not printing.in_main_set)),
        'card_printings', coalesce(
          jsonb_agg(printing.row order by printing.collector_number_order)
            filter (where not printing.in_main_set),
          '[]'::jsonb
        )
      )
    )
  into result
  from printing;
  return result;
end;
$$;

create function private.check_set_list_query(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb := '{}';
  checked_value jsonb;
  field text;
  value jsonb;
  after_key jsonb;
begin
  if jsonb_typeof(query) is distinct from 'object' then
    perform private.invalid_argument(null, 'The query must be a JSON object.');
  end if;

  for field, value in select entry.key, entry.value from jsonb_each(query) as entry order by entry.key loop
    checked_value := case
      when field = 'text' then
        case when jsonb_typeof(value) = 'string' and char_length(value #>> '{}') between 1 and 100 then value end
      when field = 'finish_view' then
        private.checked_choice(field, value, array['any', 'nonfoil', 'foil'])
      when field = 'limit' then
        private.checked_integer(field, value, 1, 50)
      when field = 'cursor' then
        case when jsonb_typeof(value) in ('string', 'null') then value end
    end;
    if checked_value is null then
      perform private.invalid_argument(field, case field
        when 'text' then 'text must be a string of 1 to 100 characters.'
        when 'cursor' then 'cursor must be a string or null.'
        else format('%s is not a known field.', field)
      end);
    end if;
    checked := checked || jsonb_build_object(field, checked_value);
  end loop;

  if not checked ? 'finish_view' then
    perform private.invalid_argument('finish_view', 'finish_view is required.');
  end if;
  checked := jsonb_build_object('limit', 20) || checked
    || jsonb_build_object('query_hash', md5(concat_ws(' ', 'sets', checked ->> 'finish_view', checked ->> 'text')));

  if jsonb_typeof(checked -> 'cursor') = 'string' then
    after_key := private.read_page_cursor(checked ->> 'cursor', checked ->> 'query_hash', 3);
    if jsonb_typeof(after_key -> 0) <> 'string' or jsonb_typeof(after_key -> 1) <> 'string' or jsonb_typeof(after_key -> 2) <> 'string' then
      perform private.raise_search_error('invalid_cursor', 'The cursor is not valid. Start again without a cursor.', 'cursor');
    end if;
    checked := checked || jsonb_build_object('after', after_key);
  end if;
  return checked;
end;
$$;

drop function public.list_sets();

create function public.list_sets(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  page_size integer;
  finish_view text;
  search_text text;
  after_released_at date;
  after_name text;
  after_code text;
  candidates text[];
  page text[] := '{}';
  completions jsonb := '{}';
  page_rows jsonb;
  last_shown public.card_sets;
begin
  perform private.caller_user_id();
  checked := private.check_set_list_query(query);
  page_size := (checked ->> 'limit')::integer;
  finish_view := checked ->> 'finish_view';
  search_text := lower(checked ->> 'text');
  after_released_at := (checked -> 'after' ->> 0)::date;
  after_name := checked -> 'after' ->> 1;
  after_code := checked -> 'after' ->> 2;

  loop
    select array_agg(candidate.code order by candidate.released_at desc, candidate.name, candidate.code)
    into candidates
    from (
      select card_set.code, card_set.name, card_set.released_at
      from public.card_sets card_set
      where (
          after_code is null
          or card_set.released_at < after_released_at
          or (card_set.released_at = after_released_at and (card_set.name, card_set.code) > (after_name, after_code))
        )
        and (
          search_text is null
          or strpos(lower(card_set.name), search_text) > 0
          or strpos(lower(card_set.code), search_text) > 0
        )
        and private.is_listed_set(card_set)
      order by card_set.released_at desc, card_set.name, card_set.code
      limit page_size + 1 - cardinality(page)
    ) candidate;
    exit when candidates is null;

    select
      page || coalesce(array_agg(candidate.code order by candidate.candidate_order), '{}'),
      completions || coalesce(jsonb_object_agg(candidate.code, main_set.completion), '{}')
    into page, completions
    from unnest(candidates) with ordinality as candidate(code, candidate_order)
    join (
      select printing.set_code, private.set_completion(array_agg(printing.counts)) as completion
      from private.set_card_printing_counts(candidates) printing
      where printing.in_main_set
      group by printing.set_code
    ) main_set on main_set.set_code = candidate.code
    where (main_set.completion -> finish_view ->> 'size')::integer > 0;

    select card_set.released_at, card_set.name, card_set.code
    into after_released_at, after_name, after_code
    from public.card_sets card_set
    where card_set.code = candidates[cardinality(candidates)];
    exit when cardinality(page) > page_size;
  end loop;

  select coalesce(jsonb_agg(
    private.set_row(card_set, art.set_art_uri, completions -> card_set.code)
    order by shown.shown_order
  ), '[]'::jsonb)
  into page_rows
  from unnest(page[1:page_size]) with ordinality as shown(code, shown_order)
  join public.card_sets card_set on card_set.code = shown.code
  left join private.set_art_uris(page[1:page_size]) art on art.set_code = card_set.code;

  if cardinality(page) <= page_size then
    return jsonb_build_object('items', page_rows, 'next_cursor', null);
  end if;
  select * into last_shown from public.card_sets card_set where card_set.code = page[page_size];
  return jsonb_build_object(
    'items', page_rows,
    'next_cursor', private.page_cursor(
      checked ->> 'query_hash',
      jsonb_build_array(last_shown.released_at, last_shown.name, last_shown.code)
    )
  );
end;
$$;

grant execute on function
  private.set_art_uris(text[]),
  private.set_row(public.card_sets, text, jsonb),
  private.is_listed_set(public.card_sets),
  private.check_set_list_query(jsonb)
to authenticated;

revoke all on function public.list_sets(jsonb) from public, anon, service_role;
grant execute on function public.list_sets(jsonb) to authenticated;

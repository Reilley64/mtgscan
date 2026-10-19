drop function private.set_card_printing_counts(text[]);
drop function private.set_completion(integer[]);

create function private.set_card_printing_counts(set_codes text[])
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
      'any', coalesce(owned.copies, 0),
      'nonfoil', case
        when 'nonfoil' = any (p.finishes) then coalesce(owned.nonfoil_copies, 0)
        else coalesce(owned.copies, 0)
      end,
      'foil', case
        when p.finishes && array['foil', 'etched']::public.card_finish[] then coalesce(owned.foil_copies, 0)
      end
    )
  from private.set_card_printings(set_codes) printing
  join public.card_printings p on p.id = printing.card_printing_id
  left join (
    select
      copy.card_printing_id,
      count(*) as copies,
      count(*) filter (where copy.finish = 'nonfoil') as nonfoil_copies,
      count(*) filter (where copy.finish in ('foil', 'etched')) as foil_copies
    from public.copies copy
    group by copy.card_printing_id
  ) owned on owned.card_printing_id = printing.card_printing_id;
$$;

create function private.set_completion(counts jsonb[])
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_object_agg(view_completion.finish_view, view_completion.completion)
  from (
    select
      finish_view,
      jsonb_build_object(
        'owned', count(printing.counts) filter (where (printing.counts ->> finish_view)::integer > 0),
        'size', count(printing.counts) filter (where printing.counts ->> finish_view is not null)
      ) as completion
    from unnest(array['any', 'nonfoil', 'foil']) as finish_view
    left join unnest(counts) as printing (counts) on true
    group by finish_view
  ) view_completion;
$$;

create or replace function public.list_sets()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  return jsonb_build_object('items', coalesce((
    with main_set as (
      select printing.set_code, array_agg(printing.counts) as counts
      from private.set_card_printing_counts(array(select listed_set.code from private.listed_sets() listed_set)) printing
      where printing.in_main_set
      group by printing.set_code
    )
    select jsonb_agg(
      private.set_row(listed_set, private.set_completion(main_set.counts))
      order by listed_set.released_at desc, listed_set.name, listed_set.code
    )
    from private.listed_sets() listed_set
    left join main_set on main_set.set_code = listed_set.code
  ), '[]'::jsonb));
end;
$$;

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
  select * into card_set from private.listed_sets() listed_set where listed_set.code = checked ->> 'code';
  if card_set.code is null then
    perform private.raise_search_error('not_found', 'code is not a released set in the card catalog.', 'code');
  end if;

  with printing as (
    select
      counts.in_main_set,
      counts.counts,
      (substring(p.collector_number from '^[0-9]+'))::numeric as collector_digits,
      p.collector_number,
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
    private.set_row(card_set, private.set_completion(array_agg(printing.counts) filter (where printing.in_main_set)))
    || jsonb_build_object(
      'main_set', coalesce(
        jsonb_agg(printing.row order by printing.collector_digits nulls last, printing.collector_number)
          filter (where printing.in_main_set),
        '[]'::jsonb
      ),
      'variants', jsonb_build_object(
        'completion', private.set_completion(array_agg(printing.counts) filter (where not printing.in_main_set)),
        'card_printings', coalesce(
          jsonb_agg(printing.row order by printing.collector_digits nulls last, printing.collector_number)
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

grant execute on function
  private.set_card_printing_counts(text[]),
  private.set_completion(jsonb[])
to authenticated;

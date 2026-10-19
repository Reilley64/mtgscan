create type private.collector_number_order as (leading_digits numeric, collector_number text);

create function private.collector_number_order(collector_number text)
returns private.collector_number_order
language sql
immutable
set search_path = ''
as $$
  select ((substring(collector_number from '^[0-9]+'))::numeric, collector_number)::private.collector_number_order;
$$;

grant execute on function private.collector_number_order(text) to authenticated;

create or replace function private.set_art_uri(card_set_code text)
returns text
language sql
stable
set search_path = ''
as $$
  select p.art_crop_uri
  from private.set_card_printings(array[card_set_code]) printing
  join public.card_printings p on p.id = printing.card_printing_id
  left join public.card_prices price on price.printing_id = p.id
  where p.art_crop_uri is not null
  order by
    greatest(price.usd_nonfoil_cents, price.usd_foil_cents, price.usd_etched_cents) desc nulls last,
    private.collector_number_order(p.collector_number)
  limit 1;
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
    private.set_row(card_set, private.set_completion(array_agg(printing.counts) filter (where printing.in_main_set)))
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

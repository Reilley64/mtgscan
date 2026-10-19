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
    (substring(p.collector_number from '^[0-9]+'))::numeric nulls last,
    p.collector_number
  limit 1;
$$;

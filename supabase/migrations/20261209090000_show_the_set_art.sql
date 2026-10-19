create function private.set_art_uri(card_set_code text)
returns text
language sql
stable
set search_path = ''
as $$
  select p.art_crop_uri
  from public.card_printings p
  left join public.card_prices price on price.printing_id = p.id
  where p.set_code = card_set_code
    and p.absent_since is null
    and p.art_crop_uri is not null
  order by
    greatest(price.usd_nonfoil_cents, price.usd_foil_cents, price.usd_etched_cents) desc nulls last,
    (substring(p.collector_number from '^[0-9]+'))::numeric nulls last,
    p.collector_number
  limit 1;
$$;

create or replace function private.set_row(card_set public.card_sets, completion jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'code', card_set.code,
    'name', card_set.name,
    'icon_svg_uri', card_set.icon_svg_uri,
    'released_at', card_set.released_at,
    'set_art_uri', private.set_art_uri(card_set.code),
    'completion', completion
  );
$$;

grant execute on function private.set_art_uri(text) to authenticated;

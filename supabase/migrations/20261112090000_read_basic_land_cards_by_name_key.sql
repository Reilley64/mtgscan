create or replace function private.basic_land_cards()
returns table (kind_order integer, name text, oracle_id uuid, image_uris text[])
language sql
stable
set search_path = ''
as $$
  select kind.kind_order, kind.name, land.oracle_id, land.image_uris
  from private.basic_land_kinds() kind
  left join lateral (
    select card.oracle_id, printing.image_uris
    from public.cards card
    join public.card_printings printing on printing.oracle_id = card.oracle_id
    where card.name_key = private.name_key(kind.name) collate "C"
      and card.name = kind.name
      and card.absent_since is null
      and printing.absent_since is null
    order by
      cardinality(printing.image_uris) > 0 desc,
      printing.lang = 'en' desc,
      'nonfoil' = any(printing.finishes) desc,
      printing.released_at desc,
      printing.set_code,
      printing.collector_number,
      printing.lang
    limit 1
  ) land on true;
$$;

select printing.set_code, printing.id::text as printing_id, card.name, printing.collector_number,
  printing.image_uris[1] as image_uri, printing.art_crop_uri, printing.finishes::text[] as finishes,
  printing.booster, printing.promo, printing.variation,
  card.type_line like 'Basic %' as basic_land, printing.absent_since is not null as absent,
  price.usd_nonfoil_cents, price.usd_foil_cents, price.usd_etched_cents,
  coalesce((select jsonb_agg(jsonb_build_object('owner_id', owned.user_id, 'finish', owned.finish, 'quantity', owned.quantity))
    from (select copy.user_id, copy.finish, count(*) as quantity from public.copies copy
      where copy.user_id = $1::uuid and copy.card_printing_id = printing.id
      group by copy.user_id, copy.finish) owned), '[]'::jsonb) as copy_counts_by_finish,
  array(select listed.position from public.set_section_card_printings listed
    where listed.set_code = printing.set_code and listed.card_printing_id = printing.id) as sections
from public.card_printings printing
join public.cards card on card.oracle_id = printing.oracle_id
left join public.card_prices price on price.printing_id = printing.id
where printing.set_code = any($2::text[])

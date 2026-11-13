select copy.user_id::text as owner_id, copy.id::text as copy_id,
  card.oracle_id::text,
  extract(epoch from copy.created_at)::double precision as created_at,
  (printing.released_at - date '1970-01-01')::double precision as released_at,
  copy.card_printing_id::text as printing_id, card.name, printing.set_code, printing.set_name,
  printing.collector_number, printing.rarity::text, printing.image_uris, printing.art_crop_uri,
  printing.artist, card.type_line, card.mana_cost, card.commander_legality::text,
  copy.finish::text, copy.condition::text, copy.language::text, copy.is_protected,
  to_char(addition.added_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as added_at,
  line.purchase_day_usd_cents,
  case copy.finish when 'nonfoil' then price.usd_nonfoil_cents
    when 'foil' then price.usd_foil_cents when 'etched' then price.usd_etched_cents end as usd_cents,
  coalesce((select snapshot.succeeded_at < now() - interval '24 hours'
    from public.import_snapshots snapshot where snapshot.source = 'prices'), true) as prices_stale,
  coalesce((select jsonb_agg(jsonb_build_object('name', face.name, 'oracle_text', face.oracle_text) order by face.face_index)
    from public.card_faces face where face.oracle_id = card.oracle_id), '[]'::jsonb) as faces,
  coalesce((select jsonb_agg(jsonb_build_object('user_tag_id', tag.id, 'name', tag.name) order by lower(tag.name), tag.name, tag.id)
    from public.copy_user_tags link join public.user_tags tag on (tag.user_id, tag.id) = (link.user_id, link.user_tag_id)
    where link.user_id = copy.user_id and link.copy_id = copy.id and link.deleted_at is null and tag.deleted_at is null), '[]'::jsonb) as user_tags,
  (select jsonb_build_object('deck_id', deck.id, 'name', deck.name,
      'role', case when allocation.commander_at is null then 'main' else 'commander' end,
      'commander_art_crop_uri', (select commander_printing.art_crop_uri from public.deck_cards commander
        join public.copies commander_copy on (commander_copy.user_id, commander_copy.id) = (commander.user_id, commander.copy_id)
        join public.card_printings commander_printing on commander_printing.id = commander_copy.card_printing_id
        where commander.user_id = deck.user_id and commander.deck_id = deck.id and commander.commander_at is not null
        order by commander.commander_at, commander.copy_id limit 1))
    from public.deck_cards allocation join public.decks deck on (deck.user_id, deck.id) = (allocation.user_id, allocation.deck_id)
    where allocation.user_id = copy.user_id and allocation.copy_id = copy.id) as deck,
  (select jsonb_build_object('deck_id', deck.id, 'name', deck.name, 'role', null,
      'commander_art_crop_uri', (select commander_printing.art_crop_uri from public.deck_cards commander
        join public.copies commander_copy on (commander_copy.user_id, commander_copy.id) = (commander.user_id, commander.copy_id)
        join public.card_printings commander_printing on commander_printing.id = commander_copy.card_printing_id
        where commander.user_id = deck.user_id and commander.deck_id = deck.id and commander.commander_at is not null
        order by commander.commander_at, commander.copy_id limit 1))
    from public.planned_swaps swap join public.decks deck on (deck.user_id, deck.id) = (swap.user_id, swap.deck_id)
    where swap.user_id = copy.user_id and swap.incoming_copy_id = copy.id and swap.status = 'open') as held_for
from public.copies copy
join public.card_printings printing on printing.id = copy.card_printing_id
join public.cards card on card.oracle_id = printing.oracle_id
join public.collection_additions addition on (addition.user_id, addition.id) = (copy.user_id, copy.addition_id)
join public.collection_addition_lines line
  on (line.user_id, line.addition_id, line.card_printing_id, line.finish, line.condition, line.language)
    = (copy.user_id, copy.addition_id, copy.card_printing_id, copy.finish, copy.condition, copy.language)
left join public.card_prices price on price.printing_id = printing.id
where copy.user_id = $1::uuid and ($2::uuid is null or copy.id = $2::uuid)
order by card.name, printing.set_code, printing.collector_number, copy.id

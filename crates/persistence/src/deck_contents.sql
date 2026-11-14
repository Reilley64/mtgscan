select jsonb_build_object(
  'created_at', deck.created_at,
  'cards', coalesce((
    select jsonb_agg(jsonb_build_object(
      'copy_id', copy.id, 'printing_id', printing.id, 'name', card.name,
      'set', printing.set_code, 'collector_number', printing.collector_number,
      'rarity', printing.rarity, 'image_uris', coalesce(to_jsonb(printing.image_uris), '[]'::jsonb),
      'finish', copy.finish, 'condition', copy.condition, 'language', copy.language,
      'protected', copy.is_protected,
      'price', case when amount.cents is null then null else jsonb_build_object(
        'currency', 'USD', 'amount', to_char(amount.cents::numeric / 100, 'FM999999999990.00'),
        'finish', copy.finish, 'stale', coalesce((
          select freshness.is_stale from public.catalog_freshness() freshness where freshness.source = 'prices'
        ), false)
      ) end,
      'role', private.deck_role(link.commander_at), 'commander_at', link.commander_at,
      'added_at', link.added_at, 'type_line', card.type_line, 'mana_value', card.mana_value,
      'colors', to_jsonb(card.colors),
      'planned_out', exists (
        select 1 from public.planned_swaps swap
        where swap.user_id = deck.user_id and swap.deck_id = deck.id
          and swap.status = 'open' and swap.outgoing_copy_id = copy.id
      )
    ) order by card.name, copy.id)
    from public.deck_cards link
    join public.copies copy on copy.user_id = link.user_id and copy.id = link.copy_id
    join public.card_printings printing on printing.id = copy.card_printing_id
    join public.cards card on card.oracle_id = printing.oracle_id
    left join public.card_prices price on price.printing_id = printing.id
    cross join lateral (select case copy.finish
      when 'nonfoil' then price.usd_nonfoil_cents
      when 'foil' then price.usd_foil_cents
      when 'etched' then price.usd_etched_cents end as cents) amount
    where link.user_id = deck.user_id and link.deck_id = deck.id
  ), '[]'::jsonb),
  'basic_lands', (
    select jsonb_agg(jsonb_build_object(
      'oracle_id', land.oracle_id, 'name', land.name,
      'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb), 'count', coalesce(basic.count, 0)
    ) order by land.kind_order)
    from private.basic_land_cards() land
    left join public.deck_basic_lands basic
      on basic.user_id = deck.user_id and basic.deck_id = deck.id and basic.oracle_id = land.oracle_id
  ),
  'evaluation', (
    select jsonb_build_object(
      'summary', jsonb_build_object('validity', evaluation.validity, 'estimated_bracket', evaluation.estimated_bracket)
        || private.deck_evaluation_staleness(evaluation),
      'violations', evaluation.violations, 'undetermined', evaluation.undetermined,
      'chosen_color', evaluation.chosen_color, 'bracket_signals', evaluation.bracket_signals,
      'missing_signal_count', evaluation.missing_signal_count, 'revision', evaluation.revision,
      'catalog_at', evaluation.catalog_at, 'oracle_tags_at', evaluation.oracle_tags_at,
      'commander_spellbook_at', evaluation.commander_spellbook_at, 'judged_at', evaluation.judged_at,
      'validity_rules_data_at', evaluation.catalog_at,
      'bracket_rules_data_at', least(evaluation.catalog_at, evaluation.oracle_tags_at, evaluation.commander_spellbook_at),
      'no_oracle_tag_data', evaluation.oracle_tags_at is null, 'no_combo_data', evaluation.commander_spellbook_at is null
    ) from public.deck_evaluations evaluation
    where evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
  )
) as contents
from public.decks deck
where deck.user_id = $1::uuid and deck.id = $2::uuid

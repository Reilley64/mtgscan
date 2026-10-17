create view private.needs_you_items with (security_invoker = true) as
  select swap.user_id, swap.deck_id
    from public.planned_swaps swap
    where swap.status = 'open'
  union all
  select card.user_id, card.deck_id
    from public.buylist_cards card
    where card.status = 'open';

grant select on table private.needs_you_items to authenticated;

create function public.get_needs_you_counts(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  perform private.check_request(query, array[]::text[]);
  return jsonb_build_object(
    'total', (select count(*) from private.needs_you_items),
    'decks', coalesce((
      select jsonb_agg(jsonb_build_object('deck_id', item.deck_id, 'count', item.count) order by item.deck_id)
      from (select deck_id, count(*) as count from private.needs_you_items group by deck_id) item
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_needs_you_counts(jsonb) from public, anon, service_role;
grant execute on function public.get_needs_you_counts(jsonb) to authenticated;

create or replace function public.list_decks(query jsonb default '{}')
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  perform private.check_request(query, array[]::text[]);
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      private.deck_row(deck) || jsonb_build_object(
        'revision', deck.revision,
        'evaluation', (
          select jsonb_build_object('validity', evaluation.validity, 'estimated_bracket', evaluation.estimated_bracket)
            || private.deck_evaluation_staleness(evaluation)
          from public.deck_evaluations evaluation
          where evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
        ),
        'needs_you_count', (
          select count(*) from private.needs_you_items item where item.user_id = deck.user_id and item.deck_id = deck.id
        )
      )
      order by deck.last_used_at desc, lower(deck.name), deck.name, deck.id
    )
    from public.decks deck
  ), '[]'::jsonb));
end;
$$;

create or replace function public.get_deck(query jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  checked jsonb;
  prices_stale boolean;
  result jsonb;
begin
  perform private.caller_user_id();
  checked := private.check_request(query, array['deck_id']);
  select f.is_stale into prices_stale
    from public.catalog_freshness() f
    where f.source = 'prices';

  select private.deck_row(deck) || jsonb_build_object(
    'revision', deck.revision,
    'created_at', deck.created_at,
    'evaluation', (
      select (to_jsonb(evaluation) - 'user_id' - 'deck_id') || jsonb_build_object(
        'validity_rules_data_at', evaluation.catalog_at,
        'bracket_rules_data_at', least(evaluation.catalog_at, evaluation.oracle_tags_at, evaluation.commander_spellbook_at),
        'no_oracle_tag_data', evaluation.oracle_tags_at is null,
        'no_combo_data', evaluation.commander_spellbook_at is null
      ) || private.deck_evaluation_staleness(evaluation)
      from public.deck_evaluations evaluation
      where evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
    ),
    'cards', (
      select coalesce(jsonb_agg(
        private.copy_row(a, p, c, price, prices_stale) || jsonb_build_object(
          'role', private.deck_role(deck_card.commander_at),
          'commander_at', deck_card.commander_at,
          'added_at', deck_card.added_at,
          'type_line', c.type_line,
          'mana_value', c.mana_value,
          'colors', to_jsonb(c.colors),
          'planned_out', exists (
            select 1
            from public.planned_swaps swap
            where swap.user_id = deck_card.user_id
              and swap.deck_id = deck_card.deck_id
              and swap.status = 'open'
              and swap.outgoing_copy_id = deck_card.copy_id
          )
        )
        order by c.name, a.copy_id
      ), '[]'::jsonb)
      from public.deck_cards deck_card
      join private.collection_availability a on a.user_id = deck_card.user_id and a.copy_id = deck_card.copy_id
      join public.card_printings p on p.id = a.card_printing_id
      join public.cards c on c.oracle_id = p.oracle_id
      left join public.card_prices price on price.printing_id = p.id
      where deck_card.user_id = deck.user_id and deck_card.deck_id = deck.id
    ),
    'basic_lands', (
      select jsonb_agg(
        jsonb_build_object(
          'oracle_id', land.oracle_id,
          'name', land.name,
          'image_uris', coalesce(to_jsonb(land.image_uris), '[]'::jsonb),
          'count', coalesce(basic_land.count, 0)
        )
        order by land.kind_order
      )
      from private.basic_land_cards() land
      left join public.deck_basic_lands basic_land
        on basic_land.user_id = deck.user_id and basic_land.deck_id = deck.id and basic_land.oracle_id = land.oracle_id
    )
  )
    into result
    from public.decks deck
    where deck.id = (checked ->> 'deck_id')::uuid;
  if result is null then
    perform private.raise_deck_not_found();
  end if;
  return result;
end;
$$;

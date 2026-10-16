create function private.rules_data_behind(evaluation public.deck_evaluations)
returns table (source public.import_source)
language sql
stable
security definer
set search_path = ''
as $$
  select snapshot.source
  from public.import_snapshots snapshot
  where snapshot.source in ('catalog', 'oracle_tags', 'commander_spellbook')
    and snapshot.snapshot_at > coalesce(
      case snapshot.source
        when 'catalog' then evaluation.catalog_at
        when 'oracle_tags' then evaluation.oracle_tags_at
        when 'commander_spellbook' then evaluation.commander_spellbook_at
      end,
      '-infinity'
    )
  union
  select 'oracle_tags'::public.import_source
  where evaluation.judged_at < (select max(change.changed_at) from public.disabled_tag_changes change);
$$;

create function private.deck_evaluation_staleness(evaluation public.deck_evaluations)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with stale_sources as (
    select freshness.source
    from public.catalog_freshness() freshness
    where freshness.succeeded_at is not null and freshness.is_stale
    union
    select behind.source
    from private.rules_data_behind(evaluation) behind
  )
  select jsonb_build_object(
    'validity_stale', exists (select 1 from stale_sources stale where stale.source = 'catalog'),
    'bracket_stale', exists (
      select 1 from stale_sources stale where stale.source in ('catalog', 'oracle_tags', 'commander_spellbook')
    )
  );
$$;

grant execute on function private.rules_data_behind(public.deck_evaluations) to deck_evaluator, authenticated;
grant execute on function private.deck_evaluation_staleness(public.deck_evaluations) to authenticated;

create or replace function public.deck_evaluations_are_behind()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.deck_evaluations evaluation
    cross join lateral private.rules_data_behind(evaluation) behind
  );
$$;

create or replace function public.list_decks()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
begin
  perform private.caller_user_id();
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(
      private.deck_row(deck) || jsonb_build_object('evaluation', (
        select jsonb_build_object('validity', evaluation.validity, 'estimated_bracket', evaluation.estimated_bracket)
          || private.deck_evaluation_staleness(evaluation)
        from public.deck_evaluations evaluation
        where evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
      ))
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
          'colors', to_jsonb(c.colors)
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

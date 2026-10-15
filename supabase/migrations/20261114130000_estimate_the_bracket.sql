alter table public.deck_evaluations
  add column estimated_bracket smallint not null default 2 check (estimated_bracket between 2 and 4),
  add column bracket_signals jsonb not null default '[]',
  add column missing_signal_count integer not null default 0 check (missing_signal_count >= 0),
  add column oracle_tags_at timestamptz,
  add column commander_spellbook_at timestamptz;

create function private.bracket_signal(kind text, source text, count integer, lowest_bracket integer, cards jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object('kind', kind, 'source', source, 'count', count, 'lowest_bracket', lowest_bracket, 'cards', cards);
$$;


create function private.ordered_cards(cards jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(item.card order by item.card ->> 'name', item.card ->> 'copy_id', item.card ->> 'oracle_id'), '[]'::jsonb)
  from jsonb_array_elements(cards) as item(card);
$$;


create function private.tagged_deck_cards(contents jsonb, tag_slug text)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select private.ordered_cards(coalesce(jsonb_agg(deck_card.card), '[]'::jsonb))
  from private.deck_evaluation_cards(contents) deck_card
  where deck_card.oracle_id in (
    select tagging.oracle_id
    from public.card_taggings tagging
    where tagging.tag_id in (
      select closure.tag_id
      from private.tag_closure(array(select tag.id from public.oracle_tags tag where tag.slug = tag_slug)) as closure(tag_id)
    )
  );
$$;


create function private.combo_lowest_bracket(bracket_tag public.combo_bracket_tag)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case bracket_tag when 'ruthless' then 4 when 'spicy' then 3 when 'powerful' then 3 end;
$$;


create function private.deck_combos(contents jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with deck_oracle_card as (
    select distinct on (deck_card.oracle_id) deck_card.oracle_id, deck_card.card
    from private.deck_evaluation_cards(contents) deck_card
    order by deck_card.oracle_id, deck_card.card ->> 'copy_id'
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'cards', private.ordered_cards(jsonb_build_array(first_card.card, second_card.card)),
      'produced_features', to_jsonb(combo.produced_features),
      'bracket_tag', combo.bracket_tag
    )
    order by private.combo_lowest_bracket(combo.bracket_tag) desc, combo.id
  ), '[]'::jsonb)
  from public.combos combo
  join deck_oracle_card first_card on first_card.oracle_id = combo.first_oracle_id
  join deck_oracle_card second_card on second_card.oracle_id = combo.second_oracle_id
  where private.combo_lowest_bracket(combo.bracket_tag) is not null;
$$;


create function private.judge_estimated_bracket(contents jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  game_changers jsonb;
  missing_signal_count integer;
  mass_land_denial jsonb;
  combos jsonb;
  extra_turns jsonb;
  signals jsonb;
begin
  select private.ordered_cards(coalesce(jsonb_agg(deck_card.card) filter (where card.is_game_changer), '[]'::jsonb)),
      count(*) filter (where card.is_game_changer is null)
    into game_changers, missing_signal_count
    from private.deck_evaluation_cards(contents) deck_card
    join public.cards card on card.oracle_id = deck_card.oracle_id;
  mass_land_denial := private.tagged_deck_cards(contents, 'mass-land-denial');
  combos := private.deck_combos(contents);
  extra_turns := private.tagged_deck_cards(contents, 'extra-turn');

  signals := jsonb_build_array(private.bracket_signal(
    'game_changers',
    'official',
    jsonb_array_length(game_changers),
    case when jsonb_array_length(game_changers) = 0 then 2 when jsonb_array_length(game_changers) <= 3 then 3 else 4 end,
    game_changers
  ));
  if jsonb_array_length(mass_land_denial) > 0 then
    signals := signals || private.bracket_signal('mass_land_denial', 'heuristic', jsonb_array_length(mass_land_denial), 4, mass_land_denial);
  end if;
  if jsonb_array_length(combos) > 0 then
    signals := signals || (
      private.bracket_signal(
        'two_card_combo',
        'heuristic',
        jsonb_array_length(combos),
        (select max(private.combo_lowest_bracket((combo ->> 'bracket_tag')::public.combo_bracket_tag))
          from jsonb_array_elements(combos) combo),
        (select private.ordered_cards(jsonb_agg(distinct card.value))
          from jsonb_array_elements(combos) combo, jsonb_array_elements(combo -> 'cards') card)
      ) || jsonb_build_object('combos', combos)
    );
  end if;
  if jsonb_array_length(extra_turns) > 0 then
    signals := signals || private.bracket_signal(
      'extra_turns',
      'heuristic',
      jsonb_array_length(extra_turns),
      case when jsonb_array_length(extra_turns) <= 3 then 2 else 4 end,
      extra_turns
    );
  end if;

  return jsonb_build_object(
    'estimated_bracket', (select max((signal ->> 'lowest_bracket')::integer) from jsonb_array_elements(signals) signal),
    'bracket_signals', signals,
    'missing_signal_count', missing_signal_count,
    'oracle_tags_at', (select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'oracle_tags'),
    'commander_spellbook_at', (
      select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'commander_spellbook'
    )
  );
end;
$$;


create or replace function private.judge_deck(contents jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  commander_count integer;
  card_count integer;
  violations jsonb := '[]';
  undetermined jsonb := '[]';
  singleton jsonb;
  legality jsonb;
  eligibility jsonb;
  partner jsonb;
begin
  select count(*) filter (where copy.role = 'commander'), count(*)
    into commander_count, card_count
    from jsonb_to_recordset(contents -> 'copies') as copy(copy_id uuid, card_printing_id uuid, role public.deck_role);
  card_count := card_count + (
    select coalesce(sum(land.count), 0)
    from jsonb_to_recordset(contents -> 'basic_lands') as land(oracle_id uuid, count integer)
  );

  if commander_count = 0 then
    violations := violations || private.violation('no_commander', 'CR 903.3', 'This deck has no commander.', null);
  end if;
  eligibility := private.judge_commander_eligibility(contents);
  violations := violations || (eligibility -> 'violations');
  undetermined := undetermined || (eligibility -> 'undetermined');
  partner := private.judge_partner(contents);
  violations := violations || (partner -> 'violations');
  undetermined := undetermined || (partner -> 'undetermined');
  if card_count <> 100 then
    violations := violations || private.violation(
      'deck_size',
      'CR 903.5a',
      format('%s of 100 cards.', card_count),
      case
        when card_count < 100 then format('Add %s.', private.card_count_label(100 - card_count))
        else format('Remove %s.', private.card_count_label(card_count - 100))
      end
    );
  end if;
  singleton := private.judge_singleton(contents);
  violations := violations || (singleton -> 'violations');
  undetermined := undetermined || (singleton -> 'undetermined');
  legality := private.judge_legality(contents);
  violations := violations || (legality -> 'violations');
  undetermined := undetermined || (legality -> 'undetermined');

  return jsonb_build_object(
    'validity', case
      when jsonb_array_length(violations) > 0 then 'invalid'
      when jsonb_array_length(undetermined) > 0 then 'cannot_be_determined'
      else 'valid'
    end,
    'violations', violations,
    'undetermined', undetermined,
    'catalog_at', (select snapshot.snapshot_at from public.import_snapshots snapshot where snapshot.source = 'catalog')
  ) || private.judge_estimated_bracket(contents);
end;
$$;


create or replace function private.save_deck_evaluation(owner_id uuid, chosen_deck_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  contents jsonb;
  judged jsonb;
begin
  contents := private.deck_contents(owner_id, chosen_deck_id);
  if contents -> 'copies' = '[]'::jsonb and contents -> 'basic_lands' = '[]'::jsonb then
    delete from public.deck_evaluations evaluation
      where evaluation.user_id = owner_id and evaluation.deck_id = chosen_deck_id;
    return;
  end if;

  judged := private.judge_deck(contents);
  insert into public.deck_evaluations (
    user_id, deck_id, validity, violations, undetermined, revision, catalog_at, judged_at,
    estimated_bracket, bracket_signals, missing_signal_count, oracle_tags_at, commander_spellbook_at
  )
    select owner_id, chosen_deck_id, (judged ->> 'validity')::public.deck_validity, judged -> 'violations',
      judged -> 'undetermined', deck.revision, (judged ->> 'catalog_at')::timestamptz, now(),
      (judged ->> 'estimated_bracket')::smallint, judged -> 'bracket_signals', (judged ->> 'missing_signal_count')::integer,
      (judged ->> 'oracle_tags_at')::timestamptz, (judged ->> 'commander_spellbook_at')::timestamptz
    from public.decks deck
    where deck.user_id = owner_id and deck.id = chosen_deck_id
    on conflict (user_id, deck_id) do update
      set validity = excluded.validity,
        violations = excluded.violations,
        undetermined = excluded.undetermined,
        revision = excluded.revision,
        catalog_at = excluded.catalog_at,
        judged_at = excluded.judged_at,
        estimated_bracket = excluded.estimated_bracket,
        bracket_signals = excluded.bracket_signals,
        missing_signal_count = excluded.missing_signal_count,
        oracle_tags_at = excluded.oracle_tags_at,
        commander_spellbook_at = excluded.commander_spellbook_at;
end;
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
      )
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

select private.save_deck_evaluation(deck.user_id, deck.id) from public.decks deck;

alter table public.deck_evaluations
  alter column estimated_bracket drop default,
  alter column bracket_signals drop default,
  alter column missing_signal_count drop default;

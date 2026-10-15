alter table public.deck_evaluations
  add column chosen_color text check (chosen_color in ('W', 'U', 'B', 'R', 'G'));

create function private.basic_land_type_colors(type_line text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(land_type.color order by land_type.color), '{}')
  from (values ('Plains', 'W'), ('Island', 'U'), ('Swamp', 'B'), ('Mountain', 'R'), ('Forest', 'G')) as land_type(name, color)
  where private.has_subtype(type_line, land_type.name);
$$;

create function private.color_names(colors text[])
returns text
language sql
immutable
set search_path = ''
as $$
  with canonical as (
    select order_letters.letters
    from unnest(array[
      'W', 'U', 'B', 'R', 'G',
      'WU', 'UB', 'BR', 'RG', 'GW', 'WB', 'UR', 'BG', 'RW', 'GU',
      'WUB', 'UBR', 'BRG', 'RGW', 'GWU', 'WBG', 'URW', 'BGU', 'RWB', 'GUR',
      'WUBR', 'UBRG', 'BRGW', 'RGWU', 'GWUB',
      'WUBRG'
    ]) as order_letters(letters)
    where (select array_agg(letter order by letter) from regexp_split_to_table(order_letters.letters, '') letter)
      = (select array_agg(color order by color) from unnest(colors) color)
  ),
  named as (
    select
      case letter.color when 'W' then 'White' when 'U' then 'Blue' when 'B' then 'Black' when 'R' then 'Red' when 'G' then 'Green' end as name,
      letter.position
    from canonical, regexp_split_to_table(canonical.letters, '') with ordinality as letter(color, position)
  )
  select case cardinality(colors)
    when 0 then 'colorless'
    when 1 then (select named.name from named)
    when 2 then (select string_agg(named.name, ' and ' order by named.position) from named)
    else (select string_agg(named.name, ', ' order by named.position) filter (where named.position < cardinality(colors)) from named)
      || ', and ' || (select named.name from named where named.position = cardinality(colors))
  end;
$$;

create function private.judge_color_identity(contents jsonb)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with deck_card as (
    select
      evaluation_card.card,
      card.name,
      card.absent_since is null as has_rules_data,
      card.commander_chooses_a_color as chooses_a_color,
      copy.role is not distinct from 'commander' as is_commander,
      card.color_identity,
      array(
        select distinct color from unnest(card.color_identity || private.basic_land_type_colors(card.type_line)) color
      ) as checked_colors,
      coalesce(basic_land.count, 1) as card_count
    from private.deck_evaluation_cards(contents) evaluation_card
    join public.cards card on card.oracle_id = evaluation_card.oracle_id
    left join jsonb_to_recordset(contents -> 'copies') as copy(copy_id uuid, role public.deck_role)
      on copy.copy_id = (evaluation_card.card ->> 'copy_id')::uuid
    left join jsonb_to_recordset(contents -> 'basic_lands') as basic_land(oracle_id uuid, count integer)
      on basic_land.oracle_id = (evaluation_card.card ->> 'oracle_id')::uuid
  ),
  commander as (
    select * from deck_card where deck_card.is_commander
  ),
  commander_identity as (
    select coalesce(array_agg(distinct color order by color), '{}') as colors
    from commander, unnest(commander.color_identity) color
  ),
  outside as (
    select deck_card.*
    from deck_card, commander_identity
    where deck_card.has_rules_data and not deck_card.checked_colors <@ commander_identity.colors
  ),
  outside_colors as (
    select coalesce(array_agg(outside_color.color order by array_position(array['W', 'U', 'B', 'R', 'G'], outside_color.color)), '{}') as colors
    from (
      select distinct color
      from outside, commander_identity, unnest(outside.checked_colors) color
      where not color = any(commander_identity.colors)
    ) outside_color
  ),
  outcome as (
    select case
      when not exists (select from commander) then 'skipped'
      when exists (select from commander where not commander.has_rules_data) then 'commander_without_rules_data'
      when not exists (select from outside) then 'inside'
      when cardinality(outside_colors.colors) = 1 and exists (select from commander where commander.chooses_a_color) then 'chosen_color'
      when cardinality(outside_colors.colors) = 1 and exists (select from commander where commander.chooses_a_color is null) then 'unknown_chooses_a_color'
      else 'outside'
    end as kind
    from outside_colors
  ),
  outside_cards as (
    select
      coalesce(sum(outside.card_count), 0)::integer as card_count,
      coalesce(jsonb_agg(outside.card order by outside.name, outside.card ->> 'copy_id'), '[]'::jsonb) as cards
    from outside
  )
  select jsonb_build_object(
    'violations', case when outcome.kind = 'outside' then jsonb_build_array(
      private.violation(
        'color_identity',
        'CR 903.5c',
        format(
          '%s %s outside %s.',
          private.card_count_label(outside_cards.card_count),
          case when outside_cards.card_count = 1 then 'is' else 'are' end,
          private.color_names(commander_identity.colors)
        ),
        null
      ) || jsonb_build_object('cards', outside_cards.cards, 'colors', to_jsonb(outside_colors.colors))
    ) else '[]'::jsonb end,
    'undetermined', case when outcome.kind = 'skipped' then '[]'::jsonb else
      coalesce((
        select jsonb_agg(
          jsonb_build_object('rule', 'color_identity', 'reason', format('No rules data for %s.', absent.name), 'cards', absent.cards)
          order by absent.name
        )
        from (
          select deck_card.name, jsonb_agg(deck_card.card order by deck_card.card ->> 'copy_id') as cards
          from deck_card
          where not deck_card.has_rules_data
          group by deck_card.name
        ) absent
      ), '[]'::jsonb) || case when outcome.kind = 'unknown_chooses_a_color' then (
        select jsonb_agg(
          jsonb_build_object(
            'rule', 'color_identity',
            'reason', format('mtgscan cannot read whether %s chooses a color.', commander.name),
            'cards', jsonb_build_array(commander.card) || outside_cards.cards
          )
          order by commander.name, commander.card ->> 'copy_id'
        )
        from commander
        where commander.chooses_a_color is null
      ) else '[]'::jsonb end
    end,
    'chosen_color', case when outcome.kind = 'chosen_color' then outside_colors.colors[1] end
  )
  from outcome, outside_cards, commander_identity, outside_colors;
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
  color_identity jsonb;
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
  color_identity := private.judge_color_identity(contents);
  violations := violations || (color_identity -> 'violations');
  undetermined := undetermined || (color_identity -> 'undetermined');
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
    'chosen_color', color_identity -> 'chosen_color',
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
    user_id, deck_id, validity, violations, undetermined, chosen_color, revision, catalog_at, judged_at,
    estimated_bracket, bracket_signals, missing_signal_count, oracle_tags_at, commander_spellbook_at
  )
    select owner_id, chosen_deck_id, (judged ->> 'validity')::public.deck_validity, judged -> 'violations',
      judged -> 'undetermined', judged ->> 'chosen_color', deck.revision, (judged ->> 'catalog_at')::timestamptz, now(),
      (judged ->> 'estimated_bracket')::smallint, judged -> 'bracket_signals', (judged ->> 'missing_signal_count')::integer,
      (judged ->> 'oracle_tags_at')::timestamptz, (judged ->> 'commander_spellbook_at')::timestamptz
    from public.decks deck
    where deck.user_id = owner_id and deck.id = chosen_deck_id
    on conflict (user_id, deck_id) do update
      set validity = excluded.validity,
        violations = excluded.violations,
        undetermined = excluded.undetermined,
        chosen_color = excluded.chosen_color,
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

select private.save_deck_evaluation(deck.user_id, deck.id) from public.decks deck;

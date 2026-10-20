CREATE OR REPLACE FUNCTION private.judge_color_identity (
  contents jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
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
$function$;

REVOKE ALL ON FUNCTION "private"."judge_color_identity"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."judge_color_identity"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."judge_color_identity"(jsonb) TO "postgres";

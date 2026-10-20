CREATE OR REPLACE FUNCTION private.judge_partner (
  contents jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with commanders as (
    select * from private.deck_commanders(contents)
  ),
  pair as (
    select
      first_commander,
      second_commander,
      coalesce(
        first_commander.has_partner
          and second_commander.has_partner
          and first_commander.partner_text is not distinct from second_commander.partner_text,
        false
      )
        or coalesce(
          first_commander.partner_with_name = second_commander.name
            and second_commander.partner_with_name = first_commander.name,
          false
        )
        or coalesce(first_commander.has_choose_a_background and second_commander.is_background, false)
        or coalesce(second_commander.has_choose_a_background and first_commander.is_background, false)
        or coalesce(first_commander.has_doctors_companion and second_commander.is_time_lord_doctor, false)
        or coalesce(second_commander.has_doctors_companion and first_commander.is_time_lord_doctor, false) as is_pair
    from commanders first_commander
    join commanders second_commander
      on (first_commander.name, first_commander.copy_id) < (second_commander.name, second_commander.copy_id)
    where (select count(*) from commanders) = 2
  ),
  unreadable as (
    select
      commander.name,
      commander.copy_id,
      commander.card,
      case
        when commander.has_rules_data then format('mtgscan cannot read the partner ability of %s.', commander.name)
        else format('No rules data for %s.', commander.name)
      end as reason
    from commanders commander
    where exists (select 1 from pair where not pair.is_pair)
      and num_nulls(commander.has_partner, commander.has_choose_a_background, commander.has_doctors_companion) > 0
  )
  select jsonb_build_object(
    'violations', coalesce((
      select jsonb_build_array(
        private.violation(
          'partner',
          'CR 702.124',
          format('%s and %s cannot be commanders together.', (pair.first_commander).name, (pair.second_commander).name),
          null
        ) || jsonb_build_object('cards', jsonb_build_array((pair.first_commander).card, (pair.second_commander).card))
      )
      from pair
      where not pair.is_pair and not exists (select 1 from unreadable)
    ), '[]'::jsonb),
    'undetermined', coalesce((
      select jsonb_agg(
        jsonb_build_object('rule', 'partner', 'reason', unreadable.reason, 'cards', jsonb_build_array(unreadable.card))
        order by unreadable.name, unreadable.copy_id
      )
      from unreadable
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION "private"."judge_partner"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."judge_partner"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."judge_partner"(jsonb) TO "postgres";

CREATE OR REPLACE FUNCTION private.judge_commander_eligibility (
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
  judged as (
    select
      commander.*,
      case
        when not commander.has_rules_data then 'undetermined'
        when commander.can_be_commander then 'eligible'
        when commander.is_background and exists (
          select 1
          from commanders other
          where other.copy_id <> commander.copy_id and other.has_choose_a_background is not false
        ) then 'eligible'
        else 'refused'
      end as eligibility
    from commanders commander
  )
  select jsonb_build_object(
    'violations', coalesce((
      select jsonb_build_array(
        private.violation(
          'commander_eligibility',
          'CR 903.3',
          string_agg(format('%s cannot be your commander.', refused.name), ' ' order by refused.name, refused.copy_id),
          null
        ) || jsonb_build_object('cards', jsonb_agg(refused.card order by refused.name, refused.copy_id))
      )
      from judged refused
      where refused.eligibility = 'refused'
      having count(*) > 0
    ), '[]'::jsonb),
    'undetermined', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'rule', 'commander_eligibility',
          'reason', format('No rules data for %s.', unknown.name),
          'cards', jsonb_build_array(unknown.card)
        )
        order by unknown.name, unknown.copy_id
      )
      from judged unknown
      where unknown.eligibility = 'undetermined'
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION "private"."judge_commander_eligibility"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."judge_commander_eligibility"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."judge_commander_eligibility"(jsonb) TO "postgres";

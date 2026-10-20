CREATE OR REPLACE FUNCTION private.judge_singleton (
  contents jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with repeated as (
    select card.oracle_id, card.name, card.copy_limit, count(*)::integer as copy_count,
      case card.copy_limit when 'one' then 1 when 'number' then card.copy_limit_number end as copy_limit_count,
      jsonb_agg(deck_card.card order by deck_card.card ->> 'copy_id') as cards
    from private.deck_evaluation_cards(contents) deck_card
    join public.cards card on card.oracle_id = deck_card.oracle_id
    where deck_card.card ->> 'kind' = 'copy'
    group by card.oracle_id
    having count(*) > 1
  ),
  over_limit as (
    select * from repeated where repeated.copy_count > repeated.copy_limit_count
  )
  select jsonb_build_object(
    'violations', case when exists (select from over_limit) then jsonb_build_array(
      private.violation(
        'singleton',
        'CR 903.5b',
        (select string_agg(format('%s copies of %s.', o.copy_count, o.name), ' ' order by o.name, o.oracle_id) from over_limit o),
        (select string_agg(format('Remove %s %s.', o.copy_count - o.copy_limit_count, o.name), ' ' order by o.name, o.oracle_id) from over_limit o)
      ) || jsonb_build_object('cards', (
        select jsonb_agg(card.value order by o.name, o.oracle_id, card.position)
        from over_limit o, jsonb_array_elements(o.cards) with ordinality as card(value, position)
      ))
    ) else '[]'::jsonb end,
    'undetermined', coalesce((
      select jsonb_agg(
        jsonb_build_object('rule', 'singleton', 'reason', format('mtgscan cannot read the copy limit of %s.', r.name), 'cards', r.cards)
        order by r.name, r.oracle_id
      )
      from repeated r
      where r.copy_limit = 'unknown'
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION "private"."judge_singleton"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."judge_singleton"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."judge_singleton"(jsonb) TO "postgres";

CREATE OR REPLACE FUNCTION private.deck_change_effect (
  stored public.deck_evaluations,
  judged jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  select jsonb_build_object(
    'kind', case when stored.validity = 'invalid' then 'adds_violation' else 'would_make_invalid' end,
    'rules', jsonb_agg(jsonb_strip_nulls(jsonb_build_object('rule', violation ->> 'rule', 'colors', violation -> 'colors')) order by position)
  )
  from jsonb_array_elements(judged -> 'violations') with ordinality as judged_violation(violation, position)
  where stored.deck_id is not null
    and (
      not exists (
        select from jsonb_array_elements(stored.violations) stored_violation
        where stored_violation ->> 'rule' = violation ->> 'rule'
      )
      or exists (
        select from jsonb_array_elements(violation -> 'cards') card
        where private.evaluation_card_key(card) not in (
          select private.evaluation_card_key(stored_card)
          from jsonb_array_elements(stored.violations) stored_violation
          cross join jsonb_array_elements(stored_violation -> 'cards') stored_card
          where stored_violation ->> 'rule' = violation ->> 'rule'
        )
      )
    )
  having count(*) > 0;
$function$;

GRANT EXECUTE ON FUNCTION "private"."deck_change_effect"(public.deck_evaluations, jsonb) TO "authenticated";

REVOKE ALL ON FUNCTION "private"."deck_change_effect"(public.deck_evaluations, jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."deck_change_effect"(public.deck_evaluations, jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."deck_change_effect"(public.deck_evaluations, jsonb) TO "postgres";

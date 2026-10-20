CREATE OR REPLACE FUNCTION private.judge_legality (
  contents jsonb
)
  RETURNS jsonb
  LANGUAGE sql
  STABLE
  SET search_path TO ''
  AS $function$
  with judged as (
    select
      deck_card.card,
      card.name,
      case
        when card.absent_since is not null or card.commander_legality = 'unknown' then 'undetermined'
        else card.commander_legality::text
      end as outcome
    from private.deck_evaluation_cards(contents) deck_card
    join public.cards card on card.oracle_id = deck_card.oracle_id
  ),
  sentences as (
    select
      judged.*,
      format(
        case judged.outcome
          when 'banned' then '%s is banned in Commander.'
          when 'not_legal' then '%s is not legal in Commander.'
          else 'No rules data for %s.'
        end,
        judged.name
      ) as sentence
    from judged
    where judged.outcome <> 'legal'
  ),
  outcomes as (
    select
      sentences.outcome,
      string_agg(distinct sentences.sentence, ' ' order by sentences.sentence) as message,
      jsonb_agg(sentences.card order by sentences.name, sentences.card ->> 'copy_id') as cards
    from sentences
    group by sentences.outcome
  )
  select jsonb_build_object(
    'violations', coalesce((
      select jsonb_agg(
        private.violation(outcomes.outcome, null, outcomes.message, null) || jsonb_build_object('cards', outcomes.cards)
        order by outcomes.outcome = 'not_legal'
      )
      from outcomes
      where outcomes.outcome in ('banned', 'not_legal')
    ), '[]'::jsonb),
    'undetermined', coalesce((
      select jsonb_agg(jsonb_build_object('rule', 'legality', 'reason', outcomes.message, 'cards', outcomes.cards))
      from outcomes
      where outcomes.outcome = 'undetermined'
    ), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION "private"."judge_legality"(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION "private"."judge_legality"(jsonb) FROM "postgres";

GRANT EXECUTE ON FUNCTION "private"."judge_legality"(jsonb) TO "postgres";

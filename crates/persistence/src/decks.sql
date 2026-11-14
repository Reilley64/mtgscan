select deck.user_id::text as owner_id,
  private.deck_row(deck) || jsonb_build_object(
    'revision', deck.revision,
    'last_used_at', to_char(deck.last_used_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'evaluation', (
      select jsonb_build_object(
        'validity', evaluation.validity, 'estimated_bracket', evaluation.estimated_bracket
      ) || private.deck_evaluation_staleness(evaluation)
      from public.deck_evaluations evaluation
      where evaluation.user_id = deck.user_id and evaluation.deck_id = deck.id
    ),
    'needs_you_count', (
      select count(*) from private.needs_you_items item
      where item.user_id = deck.user_id and item.deck_id = deck.id
    )
  ) as summary
from public.decks deck
where deck.user_id = $1::uuid and ($2::text is null or deck.id = $2::uuid)

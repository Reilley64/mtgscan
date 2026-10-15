import type { DeckEvaluation, DeckEvaluationCard } from '@mtgscan/supabase/decks';

export function evaluationCardKey(card: DeckEvaluationCard) {
  return card.kind === 'copy' ? card.copy_id : card.oracle_id;
}

export function violationCardKeys(evaluation: DeckEvaluation | null) {
  return new Set((evaluation?.violations ?? []).flatMap((violation) => violation.cards.map(evaluationCardKey)));
}

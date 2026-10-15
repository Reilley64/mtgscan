import type { DeckEvaluation } from '@mtgscan/supabase/decks';

export function violationCardKeys(evaluation: DeckEvaluation | null) {
  return new Set(
    (evaluation?.violations ?? []).flatMap((violation) =>
      violation.cards.map((card) => (card.kind === 'copy' ? card.copy_id : card.oracle_id)),
    ),
  );
}

import type { DeckEvaluation, Violation } from '@mtgscan/supabase/decks';

export function deckEvaluationOf(fields: Pick<DeckEvaluation, 'validity'> & Partial<DeckEvaluation>): DeckEvaluation {
  return {
    validity_stale: false,
    bracket_stale: false,
    violations: [],
    undetermined: [],
    chosen_color: null,
    estimated_bracket: 2,
    bracket_signals: [],
    missing_signal_count: 0,
    revision: 1,
    catalog_at: '2026-10-12T06:00:00.000Z',
    oracle_tags_at: '2026-10-12T06:00:00.000Z',
    commander_spellbook_at: '2026-10-12T06:00:00.000Z',
    judged_at: '2026-10-15T09:00:00.000Z',
    validity_rules_data_at: '2026-10-12T06:00:00.000Z',
    bracket_rules_data_at: '2026-10-12T06:00:00.000Z',
    no_oracle_tag_data: false,
    no_combo_data: false,
    ...fields,
  };
}

export const noCommander: Violation = {
  rule: 'no_commander',
  citation: 'CR 903.3',
  message: 'This deck has no commander.',
  hint: null,
  cards: [],
};

export const validEvaluation = deckEvaluationOf({ validity: 'valid' });

export const invalidEvaluation = deckEvaluationOf({
  validity: 'invalid',
  violations: [noCommander, { rule: 'deck_size', citation: 'CR 903.5a', message: '87 of 100 cards.', hint: 'Add 13 cards.', cards: [] }],
});

import type { BracketSignal, DeckCombo, DeckEvaluation } from '@mtgscan/supabase/decks';

import { Text } from '@/components/atoms/text';
import { TextLink } from '@/components/atoms/text-link';
import { BracketSignalRow } from '@/components/molecules/bracket-signal-row';
import { bracketLabel, bracketSignalNames, cardCountLabel, rulesDataLine } from '@/decks/deck-labels';
import { evaluationCardChip } from '@/decks/violation-cards';

function comboLine(combo: DeckCombo) {
  return `${combo.produced_features.join(', ')} (Commander Spellbook, ${combo.bracket_tag})`;
}

function signalDetails(signal: BracketSignal) {
  return signal.kind === 'two_card_combo' ? signal.combos.map(comboLine) : [];
}

type EstimatedBracketContentProps = {
  evaluation: DeckEvaluation;
  onOpenGuidance: () => void;
};

export function EstimatedBracketContent({ evaluation, onOpenGuidance }: EstimatedBracketContentProps) {
  const rulesData = rulesDataLine(evaluation.bracket_rules_data_at, evaluation.bracket_stale, [
    evaluation.missing_signal_count > 0 ? `Signals missing for ${cardCountLabel(evaluation.missing_signal_count)}` : null,
    evaluation.no_oracle_tag_data ? 'No Oracle tag data yet' : null,
    evaluation.no_combo_data ? 'No combo data yet' : null,
  ]);
  return (
    <>
      <Text variant="meta">Each signal sets a lowest bracket. The highest one wins.</Text>
      {evaluation.bracket_signals.map((signal) => (
        <BracketSignalRow
          key={signal.kind}
          title={`${bracketSignalNames[signal.kind]}: ${signal.count}`}
          source={signal.source}
          lowestBracket={bracketLabel(signal.lowest_bracket)}
          cards={signal.cards.map(evaluationCardChip)}
          details={signalDetails(signal)}
        />
      ))}
      <Text variant="meta">Could be Bracket 5 if built for the cEDH metagame.</Text>
      <Text variant="meta">Commander Brackets are optional guidance for a pregame conversation.</Text>
      <Text variant="body-strong">
        <TextLink onPress={onOpenGuidance}>Commander Brackets on wizards.com</TextLink>
      </Text>
      {rulesData ? <Text variant="meta">{rulesData}</Text> : null}
    </>
  );
}

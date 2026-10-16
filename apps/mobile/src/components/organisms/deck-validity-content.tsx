import type { DeckEvaluation } from '@mtgscan/supabase/decks';

import { Text } from '@/components/atoms/text';
import { RuleRow } from '@/components/molecules/rule-row';
import { colorNames, ruleNames, rulesDataLine } from '@/decks/deck-labels';
import { evaluationCardChip } from '@/decks/violation-cards';

type DeckValidityContentProps = {
  evaluation: DeckEvaluation;
  onOpenRules: () => void;
};

export function DeckValidityContent({ evaluation, onOpenRules }: DeckValidityContentProps) {
  const rulesData = rulesDataLine(evaluation.validity_rules_data_at, evaluation.validity_stale);
  return (
    <>
      <Text variant="meta">Checked against the current Commander rules.</Text>
      {evaluation.chosen_color ? <Text>Chosen color: {colorNames[evaluation.chosen_color]} (inferred)</Text> : null}
      {evaluation.violations.map((violation) => (
        <RuleRow
          key={violation.rule}
          tone="danger"
          rule={ruleNames[violation.rule]}
          citation={violation.citation ? { label: violation.citation, onPress: onOpenRules } : undefined}
          message={violation.message}
          cards={violation.cards.map(evaluationCardChip)}
          hint={violation.hint}
        />
      ))}
      {evaluation.undetermined.map((check) => (
        <RuleRow key={`${check.rule} ${check.reason}`} tone="warning" rule={ruleNames[check.rule]} message={check.reason} cards={check.cards.map(evaluationCardChip)} />
      ))}
      {evaluation.validity === 'valid' ? <Text>This deck follows the Commander rules.</Text> : null}
      {rulesData ? <Text variant="meta">{rulesData}</Text> : null}
    </>
  );
}

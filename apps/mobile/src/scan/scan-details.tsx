import { StyleSheet, Text, View } from 'react-native';

import { usePrintingImages } from '@/catalog/use-printing-images';
import { conditionLabels, conditions, finishLabels, languageNames, languages } from '@/collection/copy-labels';
import { CardImage } from '@/components/card-image';
import { ChoiceChips } from '@/components/choice-chips';
import { DangerButton } from '@/components/danger-button';
import { SecondaryButton } from '@/components/secondary-button';
import { colors, spacing, typography } from '@/theme';

import { copiesLabel, printingCaption } from './printing-caption';
import { PrintingRow } from './printing-row';
import type { BatchScan, Printing, ScanBatchAction } from './scan-batch';
import { SheetSection } from './sheet-section';

type ScanDetailsProps = {
  scan: BatchScan & { printing: Printing };
  dispatch: (action: ScanBatchAction) => void;
  onSearch: () => void;
  onRemove: () => void;
};

export function ScanDetails({ scan, dispatch, onSearch, onRemove }: ScanDetailsProps) {
  const { printing, scanId } = scan;
  const otherOptions = scan.options.filter((option) => option.printingId !== printing.printingId);
  const imageOf = usePrintingImages([printing, ...otherOptions].map((option) => option.printingId));
  const caption = [printingCaption(printing), ...(scan.copies > 1 ? [copiesLabel(scan.copies)] : [])].join(' · ');

  return (
    <View style={styles.details}>
      <View style={styles.card}>
        <View accessible accessibilityRole="image" accessibilityLabel={printing.name} style={styles.image}>
          <CardImage uri={imageOf(printing.printingId)} />
        </View>
        <Text accessibilityRole="header" style={styles.name}>
          {printing.name}
        </Text>
        <Text style={styles.caption}>{caption}</Text>
      </View>
      <SheetSection title="Finish">
        <ChoiceChips
          values={printing.finishes}
          selected={scan.finish}
          labelOf={(finish) => finishLabels[finish]}
          onSelect={(finish) => dispatch({ type: 'setFinish', scanId, finish })}
        />
      </SheetSection>
      <SheetSection title="Condition">
        <ChoiceChips
          values={conditions}
          selected={scan.condition}
          labelOf={(condition) => conditionLabels[condition]}
          onSelect={(condition) => dispatch({ type: 'setCondition', scanId, condition })}
        />
      </SheetSection>
      <SheetSection title="Language">
        <ChoiceChips
          values={languages}
          selected={scan.language}
          labelOf={(language) => languageNames[language]}
          onSelect={(language) => dispatch({ type: 'setLanguage', scanId, language })}
        />
      </SheetSection>
      {otherOptions.length > 0 ? (
        <SheetSection title="Other options">
          {otherOptions.map((option) => (
            <PrintingRow
              key={option.printingId}
              printing={option}
              image={imageOf(option.printingId)}
              onPress={() => dispatch({ type: 'choose', scanId, printing: option, source: 'scan' })}
            />
          ))}
        </SheetSection>
      ) : null}
      <SecondaryButton label="None of these: search" onPress={onSearch} />
      <DangerButton label="Remove scan" onPress={onRemove} />
    </View>
  );
}

const styles = StyleSheet.create({
  details: {
    gap: spacing.lg,
  },
  card: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  image: {
    width: '55%',
    marginBottom: spacing.sm,
  },
  name: {
    ...typography.cardTitle,
    color: colors.text,
    textAlign: 'center',
  },
  caption: {
    ...typography.meta,
    color: colors.textMuted,
  },
});

import { StyleSheet, Text as NativeText, View } from 'react-native';

import { usePrintingImages } from '@/catalog/use-printing-images';
import { conditionLabels, conditions, finishLabels, languageNames, languages } from '@/collection/copy-labels';
import { CardImage } from '@/components/atoms/card-image';
import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { ChipGroup } from '@/components/molecules/chip-group';
import { colors, spacing, typography } from '@/theme';

import { copiesDetail, printingCaption } from './printing-caption';
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
  const caption = [printingCaption(printing), ...copiesDetail(scan.copies)].join(' · ');

  return (
    <View style={styles.details}>
      <View style={styles.card}>
        <View accessible accessibilityRole="image" accessibilityLabel={printing.name} style={styles.image}>
          <CardImage uri={imageOf(printing.printingId)} />
        </View>
        <NativeText accessibilityRole="header" style={styles.name}>
          {printing.name}
        </NativeText>
        <NativeText style={styles.caption}>{caption}</NativeText>
      </View>
      <SheetSection title="Finish">
        <ChipGroup
          values={printing.finishes}
          selected={scan.finish}
          labelOf={(finish) => finishLabels[finish]}
          onSelect={(finish) => dispatch({ type: 'setFinish', scanId, finish })}
        />
      </SheetSection>
      <SheetSection title="Condition">
        <ChipGroup
          values={conditions}
          selected={scan.condition}
          labelOf={(condition) => conditionLabels[condition]}
          onSelect={(condition) => dispatch({ type: 'setCondition', scanId, condition })}
        />
      </SheetSection>
      <SheetSection title="Language">
        <ChipGroup
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
              onPress={() => dispatch({ type: 'choose', scanId, printing: option })}
            />
          ))}
        </SheetSection>
      ) : null}
      <Button onPress={onSearch}>
        <Text>None of these: search</Text>
      </Button>
      <Button variant="danger" onPress={onRemove}>
        <Text>Remove scan</Text>
      </Button>
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

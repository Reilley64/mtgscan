import { Pressable, StyleSheet, Text, View } from 'react-native';

import { finishes, finishLabels } from '@/collection/copy-labels';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

import type { BatchScan, Printing } from './scan-batch';

type QuickActionsProps = {
  scan: BatchScan & { printing: Printing };
  onAddCopy: () => void;
  onChangeFinish: (finish: BatchScan['finish']) => void;
  onChangeSet: () => void;
};

const touchSlop = (sizes.touchTarget - sizes.quickAction) / 2;

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={{ top: touchSlop, bottom: touchSlop }}
      style={styles.action}>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

export function QuickActions({ scan, onAddCopy, onChangeFinish, onChangeSet }: QuickActionsProps) {
  const printingFinishes = finishes.filter((finish) => scan.printing.finishes.includes(finish));
  const nextFinish = printingFinishes[(printingFinishes.indexOf(scan.finish) + 1) % printingFinishes.length];
  return (
    <View style={styles.actions}>
      <QuickAction label="+1" onPress={onAddCopy} />
      {printingFinishes.length > 1 ? (
        <QuickAction label={finishLabels[scan.finish]} onPress={() => onChangeFinish(nextFinish)} />
      ) : null}
      <QuickAction label="Change set" onPress={onChangeSet} />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    height: sizes.quickAction,
    minWidth: sizes.touchTarget,
    paddingHorizontal: spacing.md,
    borderRadius: rounded.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceControl,
  },
  label: {
    ...typography.chip,
    color: colors.text,
  },
});

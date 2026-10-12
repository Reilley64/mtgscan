import { Pressable, StyleSheet, Text, View } from 'react-native';

import { finishes, finishLabels } from '@/collection/copy-labels';
import { colors, rounded, sizes, spacing, typography } from '@/theme';

import type { BatchScan, Printing } from './scan-batch';

type QuickActionsProps = {
  scan: (BatchScan & { printing: Printing }) | null;
  onAddCopy: (scanId: string) => void;
  onChangeFinish: (scanId: string, finish: BatchScan['finish']) => void;
  onChangeSet: (scanId: string) => void;
};

const touchSlop = (sizes.touchTarget - sizes.quickAction) / 2;

function QuickAction({ label, onPress }: { label: string; onPress: (() => void) | null }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress ?? undefined}
      hitSlop={{ top: touchSlop, bottom: touchSlop }}
      style={styles.action}>
      <Text style={[styles.label, !onPress && styles.disabledLabel]}>{label}</Text>
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export function QuickActions({ scan, onAddCopy, onChangeFinish, onChangeSet }: QuickActionsProps) {
  if (!scan) {
    return (
      <View style={styles.bar}>
        <QuickAction label="Finish" onPress={null} />
        <Divider />
        <QuickAction label="Set" onPress={null} />
        <Divider />
        <QuickAction label="+1" onPress={null} />
      </View>
    );
  }
  const printingFinishes = finishes.filter((finish) => scan.printing.finishes.includes(finish));
  const nextFinish = printingFinishes[(printingFinishes.indexOf(scan.finish) + 1) % printingFinishes.length];
  return (
    <View style={styles.bar}>
      <QuickAction
        label={finishLabels[scan.finish]}
        onPress={printingFinishes.length > 1 ? () => onChangeFinish(scan.scanId, nextFinish) : null}
      />
      <Divider />
      <QuickAction label={scan.printing.setCode.toUpperCase()} onPress={() => onChangeSet(scan.scanId)} />
      <Divider />
      <QuickAction label="+1" onPress={() => onAddCopy(scan.scanId)} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: rounded.md,
    backgroundColor: colors.surfaceControl,
  },
  action: {
    height: sizes.quickAction,
    minWidth: sizes.touchTarget,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.chip,
    color: colors.text,
  },
  disabledLabel: {
    color: colors.textDim,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: sizes.quickAction / 2,
    backgroundColor: colors.line,
  },
});

import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSetIcons } from '@/catalog/use-set-icons';

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

type QuickActionProps = {
  label: string;
  onPress: (() => void) | null;
  children?: ReactNode;
};

function QuickAction({ label, onPress, children }: QuickActionProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !onPress }}
      disabled={!onPress}
      onPress={onPress ?? undefined}
      hitSlop={{ top: touchSlop, bottom: touchSlop }}
      style={styles.action}>
      {children ?? <Text style={[styles.label, !onPress && styles.disabledLabel]}>{label}</Text>}
    </Pressable>
  );
}

function SetAction({ setCode, onPress }: { setCode: string; onPress: () => void }) {
  const iconOf = useSetIcons([setCode]);
  const icon = iconOf(setCode);
  return (
    <QuickAction label={setCode.toUpperCase()} onPress={onPress}>
      {icon ? (
        <Image source={icon} tintColor={colors.text} contentFit="contain" cachePolicy="disk" style={styles.setIcon} />
      ) : null}
    </QuickAction>
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
        <QuickAction label="Set" onPress={null}>
          <SymbolView name="square.dashed" tintColor={colors.textDim} size={sizes.setIcon} />
        </QuickAction>
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
      <SetAction setCode={scan.printing.setCode} onPress={() => onChangeSet(scan.scanId)} />
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
  setIcon: {
    width: sizes.setIcon,
    height: sizes.setIcon,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    height: sizes.quickAction / 2,
    backgroundColor: colors.line,
  },
});

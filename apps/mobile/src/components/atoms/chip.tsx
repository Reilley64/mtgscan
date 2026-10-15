import { cva, type VariantProps } from 'class-variance-authority';
import type { SFSymbol } from 'expo-symbols';
import { Pressable, View } from 'react-native';

import { choiceStates, verticalTouchSlop } from '@/components/atoms/control-style';
import { Text } from '@/components/atoms/text';
import { SymbolView } from '@/components/atoms/symbol-view';
import { cn } from '@/lib/class-names';
import { sizes } from '@/theme';

const chipClass = 'h-chip justify-center rounded-md px-chip-padding';

const toneVariants = cva('', {
  variants: {
    tone: {
      neutral: 'text-text',
      warning: 'text-warning',
      danger: 'text-danger',
      info: 'text-info',
    },
  },
});

const removableVariants = cva(cn(chipClass, 'min-w-touch-target flex-row items-center gap-xs'), {
  variants: {
    tone: {
      neutral: 'bg-surface-control',
      danger: 'bg-danger-tint',
    },
  },
});

type ChipTone = NonNullable<VariantProps<typeof toneVariants>['tone']>;

export type StatusChipProps = {
  label: string;
  tone?: ChipTone;
  symbol?: SFSymbol;
  accessibilityLabel?: string;
};

type StatusChipOnlyProps = StatusChipProps & {
  selected?: never;
  onPress?: never;
  onRemove?: never;
};

type SelectableChipProps = {
  label: string;
  tone?: never;
  symbol?: never;
  accessibilityLabel?: never;
  selected: boolean;
  onPress: () => void;
  onRemove?: never;
};

type RemovableChipProps = {
  label: string;
  tone?: 'neutral' | 'danger';
  symbol?: never;
  accessibilityLabel?: never;
  selected?: never;
  onPress?: never;
  onRemove: () => void;
};

function StatusChipLabel({ label, tone = 'neutral', symbol }: Omit<StatusChipProps, 'accessibilityLabel'>) {
  return (
    <>
      {symbol && <SymbolView name={symbol} size={sizes.chipSymbol} className={toneVariants({ tone })} />}
      <Text className={cn('text-chip', toneVariants({ tone }))}>{label}</Text>
    </>
  );
}

export type StatusChipButtonProps = StatusChipProps & {
  accessibilityLabel: string;
  onPress: () => void;
};

export function StatusChipButton({ accessibilityLabel, onPress, ...chip }: StatusChipButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={verticalTouchSlop(sizes.chip)}
      onPress={onPress}
      className={cn(chipClass, 'min-w-touch-target flex-row items-center gap-xs bg-surface-control')}>
      <StatusChipLabel {...chip} />
      <SymbolView name="chevron.right" size={sizes.chipSymbol} className={toneVariants({ tone: chip.tone ?? 'neutral' })} />
    </Pressable>
  );
}

export function Chip({
  label,
  tone = 'neutral',
  symbol,
  accessibilityLabel,
  selected,
  onPress,
  onRemove,
}: StatusChipOnlyProps | SelectableChipProps | RemovableChipProps) {
  if (onRemove) {
    const removableTone = tone === 'danger' ? 'danger' : 'neutral';
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint="Removes this chip."
        hitSlop={verticalTouchSlop(sizes.chip)}
        onPress={onRemove}
        className={removableVariants({ tone: removableTone })}>
        <Text className={cn('text-chip', toneVariants({ tone: removableTone }))}>{label}</Text>
        <Text className={cn('text-chip', toneVariants({ tone: removableTone }))}>×</Text>
      </Pressable>
    );
  }
  if (!onPress) {
    return (
      <View
        accessible
        accessibilityLabel={accessibilityLabel ?? label}
        className={cn(chipClass, 'flex-row items-center gap-xs self-start bg-surface-control')}>
        <StatusChipLabel label={label} tone={tone} symbol={symbol} />
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      aria-selected={selected}
      hitSlop={verticalTouchSlop(sizes.chip)}
      onPress={onPress}
      className={cn(chipClass, 'min-w-touch-target items-center', choiceStates.selected.fill)}>
      <Text className={cn('text-chip', choiceStates.selected.label)}>{label}</Text>
    </Pressable>
  );
}

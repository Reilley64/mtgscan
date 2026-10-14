import { cva } from 'class-variance-authority';
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

type StatusChipProps = {
  label: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'info';
  symbol?: SFSymbol;
  selected?: never;
  onPress?: never;
  onRemove?: never;
};

type SelectableChipProps = {
  label: string;
  tone?: never;
  symbol?: never;
  selected: boolean;
  onPress: () => void;
  onRemove?: never;
};

type RemovableChipProps = {
  label: string;
  tone?: 'neutral' | 'danger';
  symbol?: never;
  selected?: never;
  onPress?: never;
  onRemove: () => void;
};

export function Chip({
  label,
  tone = 'neutral',
  symbol,
  selected,
  onPress,
  onRemove,
}: StatusChipProps | SelectableChipProps | RemovableChipProps) {
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
        accessibilityLabel={label}
        className={cn(chipClass, 'flex-row items-center gap-xs self-start bg-surface-control')}>
        {symbol && <SymbolView name={symbol} size={sizes.chipSymbol} className={toneVariants({ tone })} />}
        <Text className={cn('text-chip', toneVariants({ tone }))}>{label}</Text>
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

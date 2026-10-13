import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { choiceStates, verticalTouchSlop } from '@/components/atoms/control-style';
import { Text } from '@/components/atoms/text';
import { cn } from '@/lib/class-names';
import { sizes } from '@/theme';

const chipClass = 'h-chip justify-center rounded-md px-chip-padding';

const toneVariants = cva('text-chip', {
  variants: {
    tone: {
      neutral: 'text-text',
      warning: 'text-warning',
      danger: 'text-danger',
      info: 'text-info',
    },
  },
});

type StatusChipProps = {
  label: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'info';
  children?: ReactNode;
  selected?: never;
  onPress?: never;
};

type SelectableChipProps = {
  label: string;
  tone?: never;
  children?: never;
  selected: boolean;
  onPress: () => void;
};

export function Chip({ label, tone = 'neutral', children, selected, onPress }: StatusChipProps | SelectableChipProps) {
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} className={cn(chipClass, 'self-start bg-surface-control')}>
        {children ?? <Text className={toneVariants({ tone })}>{label}</Text>}
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

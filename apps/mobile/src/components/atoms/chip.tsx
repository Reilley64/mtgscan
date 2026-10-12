import { cva } from 'class-variance-authority';
import { Pressable, View } from 'react-native';

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

const extraTouch = (sizes.touchTarget - sizes.chip) / 2;

type StatusChipProps = {
  label: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'info';
  selected?: never;
  onPress?: never;
};

type SelectableChipProps = {
  label: string;
  tone?: never;
  selected: boolean;
  onPress: () => void;
};

export function Chip({ label, tone = 'neutral', selected, onPress }: StatusChipProps | SelectableChipProps) {
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} className={cn(chipClass, 'self-start bg-surface-control')}>
        <Text className={toneVariants({ tone })}>{label}</Text>
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      hitSlop={{ top: extraTouch, bottom: extraTouch }}
      onPress={onPress}
      className={cn(chipClass, 'min-w-touch-target items-center', selected ? 'bg-primary' : 'bg-surface-control')}>
      <Text className={cn('text-chip', selected ? 'text-on-primary' : 'text-text')}>{label}</Text>
    </Pressable>
  );
}

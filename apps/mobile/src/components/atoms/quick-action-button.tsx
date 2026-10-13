import { cva } from 'class-variance-authority';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { verticalTouchSlop } from '@/components/atoms/control-style';
import { useOnGlass } from '@/components/atoms/glass-surface';
import { Text } from '@/components/atoms/text';
import { sizes } from '@/theme';

const disabledLabels = cva('', {
  variants: {
    onGlass: {
      true: 'group-disabled:text-glass-text-dim',
      false: 'group-disabled:text-text-dim',
    },
  },
});

type QuickActionButtonProps = {
  label: string;
  onPress?: () => void;
  children?: ReactNode;
};

export function QuickActionButton({ label, onPress, children }: QuickActionButtonProps) {
  const disabled = !onPress;
  const onGlass = useOnGlass();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={verticalTouchSlop(sizes.quickAction)}
      className="group h-quick-action min-w-touch-target items-center justify-center px-md">
      {children ?? (
        <Text variant="chip" className={disabledLabels({ onGlass })}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

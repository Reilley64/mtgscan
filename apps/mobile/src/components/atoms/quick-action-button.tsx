import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

import { verticalTouchSlop } from '@/components/atoms/control-style';
import { Text } from '@/components/atoms/text';
import { sizes } from '@/theme';

type QuickActionButtonProps = {
  label: string;
  onPress?: () => void;
  children?: ReactNode;
};

export function QuickActionButton({ label, onPress, children }: QuickActionButtonProps) {
  const disabled = !onPress;
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
        <Text variant="chip" className="group-disabled:text-text-dim">
          {label}
        </Text>
      )}
    </Pressable>
  );
}

import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

type TileButtonProps = {
  accessibilityLabel: string;
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
};

export function TileButton({ accessibilityLabel, selected, onPress, children }: TileButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      onPress={onPress}
      className="min-h-touch-target gap-xs">
      {children}
    </Pressable>
  );
}

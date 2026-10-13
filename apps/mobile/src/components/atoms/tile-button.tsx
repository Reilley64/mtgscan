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
      aria-selected={selected}
      onPress={onPress}
      className="group min-h-touch-target gap-xs">
      {children}
    </Pressable>
  );
}

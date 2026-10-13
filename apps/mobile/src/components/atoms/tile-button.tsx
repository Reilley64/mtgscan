import type { ReactNode } from 'react';
import { Pressable } from 'react-native';

type TileButtonProps = {
  accessibilityLabel: string;
  accessibilityHint?: string;
  selected: boolean;
  onPress: () => void;
  children: ReactNode;
};

export function TileButton({ accessibilityLabel, accessibilityHint, selected, onPress, children }: TileButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      aria-selected={selected}
      onPress={onPress}
      className="group/tile min-h-touch-target gap-xs">
      {children}
    </Pressable>
  );
}

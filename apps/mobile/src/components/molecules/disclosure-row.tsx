import type { ReactNode } from 'react';
import { View } from 'react-native';

import { DimSymbol } from '@/components/atoms/dim-symbol';
import { Surface } from '@/components/atoms/surface';
import { sizes } from '@/theme';

type DisclosureRowProps = {
  accessibilityLabel: string;
  onPress: () => void;
  children: ReactNode;
};

export function DisclosureRow({ accessibilityLabel, onPress, children }: DisclosureRowProps) {
  return (
    <Surface accessibilityLabel={accessibilityLabel} onPress={onPress} className="flex-row items-center gap-md">
      <View className="flex-1">{children}</View>
      <DimSymbol name="chevron.right" size={sizes.chevron} />
    </Surface>
  );
}

import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { spacing } from '@/theme';

export function FloatingButtons({ children }: { children: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  return (
    <View className="absolute right-lg flex-row gap-sm" style={{ bottom: bottom + spacing.lg }}>
      {children}
    </View>
  );
}

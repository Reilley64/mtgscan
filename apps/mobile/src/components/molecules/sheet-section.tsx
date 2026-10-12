import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/atoms/text';

export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-sm">
      <Text variant="body-strong" accessibilityRole="header" className="text-primary">
        {title}
      </Text>
      {children}
    </View>
  );
}

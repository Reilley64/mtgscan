import { View } from 'react-native';

import { Text } from '@/components/atoms/text';

export function Brand() {
  return (
    <View className="flex-row items-center gap-sm">
      <View className="h-brand-mark-height w-brand-mark-width rounded-xs border-brand-mark border-primary" />
      <Text variant="brand">mtgscan</Text>
    </View>
  );
}

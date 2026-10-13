import { View } from 'react-native';

import { Text } from '@/components/atoms/text';

export function DangerMark() {
  return (
    <View className="h-failure-mark w-failure-mark items-center justify-center rounded-full bg-danger-tint">
      <Text variant="body-strong" className="text-danger">
        !
      </Text>
    </View>
  );
}

import { View } from 'react-native';

import { Surface } from '@/components/atoms/surface';
import { Text } from '@/components/atoms/text';

export function FailureNotice({ message }: { message: string }) {
  return (
    <Surface
      accessible
      accessibilityLabel={message}
      accessibilityRole="alert"
      className="flex-row items-baseline gap-sm px-md py-md">
      <View className="h-failure-mark w-failure-mark items-center justify-center rounded-full bg-danger-tint">
        <Text variant="body-strong" className="text-danger">
          !
        </Text>
      </View>
      <Text variant="body-strong" className="flex-1">
        {message}
      </Text>
    </Surface>
  );
}

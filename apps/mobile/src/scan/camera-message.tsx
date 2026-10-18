import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';

type CameraMessageProps = {
  message: string;
  detail?: string;
  action?: { label: string; onPress: () => void };
  children?: ReactNode;
};

export function CameraMessage({ message, detail, action, children }: CameraMessageProps) {
  return (
    <View className="flex-1 justify-center gap-lg px-lg">
      <View className="gap-xs">
        <Text variant="body-strong" className="text-center">
          {message}
        </Text>
        {detail ? <Text className="text-center text-text-muted">{detail}</Text> : null}
      </View>
      {children}
      {action ? (
        <Button onPress={action.onPress}>
          <Text>{action.label}</Text>
        </Button>
      ) : null}
    </View>
  );
}

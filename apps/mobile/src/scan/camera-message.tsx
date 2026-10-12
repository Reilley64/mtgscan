import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';

type CameraMessageProps = {
  message: string;
  action?: { label: string; onPress: () => void };
  children?: ReactNode;
};

export function CameraMessage({ message, action, children }: CameraMessageProps) {
  return (
    <View className="flex-1 justify-center gap-lg px-lg">
      <Text variant="body-strong" className="text-center">
        {message}
      </Text>
      {children}
      {action ? (
        <Button onPress={action.onPress}>
          <Text>{action.label}</Text>
        </Button>
      ) : null}
    </View>
  );
}

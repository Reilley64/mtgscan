import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';

type EmptyStateProps = {
  illustration: ReactNode;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
};

export function EmptyState({ illustration, title, message, action }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center gap-lg px-lg py-xl">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" className="w-full items-center">
        {illustration}
      </View>
      <View accessible accessibilityLabel={[title, message].filter(Boolean).join(', ')} className="items-center gap-xs">
        <Text variant="sheet-title" className="text-center">
          {title}
        </Text>
        {message ? <Text className="text-center text-text-muted">{message}</Text> : null}
      </View>
      {action ? (
        <Button variant="primary" onPress={action.onPress}>
          <Text>{action.label}</Text>
        </Button>
      ) : null}
    </View>
  );
}

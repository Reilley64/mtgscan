import { View } from 'react-native';

import { Text } from '@/components/atoms/text';

type EmptyStateProps = {
  title: string;
  message?: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <View className="gap-xs py-lg">
      <Text variant="body-strong">{title}</Text>
      {message ? <Text className="text-text-muted">{message}</Text> : null}
    </View>
  );
}

import { View } from 'react-native';

import { Text } from '@/components/ui/text';

type EmptyStateProps = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <View className="gap-xs py-lg">
      <Text className="text-body-strong">{title}</Text>
      <Text className="text-text-muted">{message}</Text>
    </View>
  );
}

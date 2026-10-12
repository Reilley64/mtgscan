import { Text, View } from 'react-native';

type EmptyStateProps = {
  title: string;
  message: string;
};

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <View className="gap-xs py-lg">
      <Text className="text-body-strong text-text">{title}</Text>
      <Text className="text-body text-text-muted">{message}</Text>
    </View>
  );
}

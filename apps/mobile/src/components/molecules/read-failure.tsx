import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { EmptyState } from '@/components/molecules/empty-state';

export function ReadFailure({ title, onTryAgain }: { title: string; onTryAgain: () => void }) {
  return (
    <View className="gap-lg">
      <EmptyState title={title} message="Check your connection." />
      <Button onPress={onTryAgain}>
        <Text>Try again</Text>
      </Button>
    </View>
  );
}

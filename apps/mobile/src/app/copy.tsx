import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, View } from 'react-native';

import { copyPriceCurrency, useCopy } from '@/collection/use-copy';
import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { EmptyState } from '@/components/molecules/empty-state';
import { CopyPageContent } from '@/components/organisms/copy-page-content';
import { PushedScreen } from '@/components/templates/pushed-screen';

export default function CopyScreen() {
  const { copyId } = useLocalSearchParams<{ copyId: string }>();
  const { read, reload } = useCopy(copyId);

  useEffect(() => {
    if (read.status === 'missing') {
      Alert.alert('This card is no longer in your collection.', undefined, [{ text: 'OK', onPress: () => router.back() }]);
    }
  }, [read.status]);

  return (
    <PushedScreen>
      {read.status === 'loaded' ? <CopyPageContent copy={read.copy} currency={copyPriceCurrency} /> : null}
      {read.status === 'failed' ? (
        <View className="gap-lg px-lg pt-safe-offset-xl">
          <EmptyState title="Could not load this card" message="Check your connection." />
          <Button onPress={reload}>
            <Text>Try again</Text>
          </Button>
        </View>
      ) : null}
    </PushedScreen>
  );
}

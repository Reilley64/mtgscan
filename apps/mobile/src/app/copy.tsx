import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, View } from 'react-native';

import { copyPriceCurrency, useCopy } from '@/collection/use-copy';
import { ReadFailure } from '@/components/molecules/read-failure';
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
        <View className="px-lg pt-safe-offset-xl">
          <ReadFailure title="Could not load this card" onTryAgain={reload} />
        </View>
      ) : null}
    </PushedScreen>
  );
}

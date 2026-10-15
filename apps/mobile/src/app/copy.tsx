import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Alert, View } from 'react-native';

import { deleteCopy, setCopyProtected } from '@/collection/copy-writes';
import { usePriceCurrency } from '@/collection/price-currency-setting';
import { useCopy } from '@/collection/use-copy';
import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { copyActionsMenu } from '@/components/organisms/copy-actions-menu';
import { CopyPageContent } from '@/components/organisms/copy-page-content';
import { PushedScreen } from '@/components/templates/pushed-screen';
import { colors } from '@/theme';

export default function CopyScreen() {
  const { copyId } = useLocalSearchParams<{ copyId: string }>();
  const { read, reload } = useCopy(copyId);
  const { priceCurrency } = usePriceCurrency();

  useEffect(() => {
    if (read.status === 'missing') {
      Alert.alert('This card is no longer in your collection.', undefined, [{ text: 'OK', onPress: () => router.back() }]);
    }
  }, [read.status]);

  async function deleteThisCopy() {
    const result = await deleteCopy(copyId);
    if (result === 'done') {
      router.back();
    } else if (result === 'missing') {
      reload();
    } else {
      Alert.alert('Could not delete this copy', 'Check your connection.');
    }
  }

  async function changeProtected(isProtected: boolean) {
    if ((await setCopyProtected(copyId, isProtected)) === 'failed') {
      Alert.alert(isProtected ? 'Could not protect this card' : 'Could not unprotect this card', 'Check your connection.');
      return;
    }
    reload();
  }

  function confirmDelete() {
    Alert.alert('Delete this copy?', 'It leaves your collection with its user tags. This cannot be undone.', [
      { text: 'Delete copy', style: 'destructive', onPress: deleteThisCopy },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <PushedScreen>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" tintColor={colors.text} accessibilityLabel="Close" onPress={() => router.back()} />
      </Stack.Toolbar>
      {read.status === 'loaded' && priceCurrency ? (
        <>
          <Stack.Toolbar placement="right">
            {copyActionsMenu({ copy: read.copy, onSetProtected: changeProtected, onDelete: confirmDelete })}
          </Stack.Toolbar>
          <CopyPageContent
            copy={read.copy}
            priceCurrency={priceCurrency}
            onOpenUserTags={() => router.push({ pathname: '/user-tag-picker', params: { copyId } })}
          />
        </>
      ) : null}
      {read.status === 'failed' ? (
        <View className="px-lg pt-safe-offset-xl">
          <ReadFailure
            illustration={<DashedCardFrame symbol="wifi.slash" />}
            title="Could not load this card"
            onTryAgain={reload}
          />
        </View>
      ) : null}
    </PushedScreen>
  );
}

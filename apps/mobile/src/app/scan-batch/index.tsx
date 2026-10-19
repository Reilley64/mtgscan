import { router, Stack, useNavigation } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert } from 'react-native';

import { EmptyState } from '@/components/molecules/empty-state';
import { GhostBatchRows } from '@/components/molecules/empty-state-illustrations';
import { FailureNotice } from '@/components/molecules/failure-notice';
import { SwipeToConfirm } from '@/components/molecules/swipe-to-confirm';
import { batchReviewMenu } from '@/components/organisms/batch-review-menu';
import { ScanBatchList } from '@/components/organisms/scan-batch-list';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { useScanBatch } from '@/scan/scan-batch-state';

export default function BatchReviewSheet() {
  const navigation = useNavigation();
  const { batch, commit, commitStatus, removeAll } = useScanBatch();
  const [closing, setClosing] = useState(false);
  const scanCount = batch.scans.length;
  const showsEmptyState = scanCount === 0 && !closing;
  const title = scanCount === 1 ? '1 card scanned' : `${scanCount} cards scanned`;

  const addToCollection = useCallback(async () => {
    setClosing(true);
    const closes = (await commit()) && navigation.isFocused();
    setClosing(closes);
    if (closes) {
      router.back();
    }
    return closes;
  }, [commit, navigation]);

  const removeAllScans = useCallback(() => {
    setClosing(true);
    removeAll();
    router.back();
  }, [removeAll]);

  const confirmRemoveAllScans = useCallback(() => {
    const [alertTitle, alertMessage] =
      scanCount === 1
        ? ['Remove 1 scan?', 'It will not be added to your collection.']
        : [`Remove all ${scanCount} scans?`, 'They will not be added to your collection.'];
    Alert.alert(alertTitle, alertMessage, [
      { text: 'Remove', style: 'destructive', onPress: removeAllScans },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [removeAllScans, scanCount]);

  const footer = showsEmptyState ? undefined : (
    <>
      {commitStatus === 'failed' ? (
        <FailureNotice message="Could not add to your collection. Your scans are kept." />
      ) : null}
      <SwipeToConfirm
        label={commitStatus === 'failed' ? 'Try again' : 'Add to collection'}
        disabled={scanCount === 0}
        busy={commitStatus === 'adding'}
        onConfirm={addToCollection}
      />
    </>
  );

  return (
    <DrawerSheet belowHeader footer={footer}>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="right">
        {batchReviewMenu({
          scanCount,
          hidden: commitStatus === 'adding',
          onRemoveAll: confirmRemoveAllScans,
        })}
      </Stack.Toolbar>
      {showsEmptyState ? (
        <EmptyState
          illustration={<GhostBatchRows />}
          title="No scans yet"
          message="Cards you scan wait here until you add them."
        />
      ) : (
        <ScanBatchList
          scans={[...batch.scans].reverse()}
          onOpen={
            commitStatus === 'adding'
              ? undefined
              : (scanId) => router.push({ pathname: '/scan-batch/scan-details', params: { scanId } })
          }
        />
      )}
    </DrawerSheet>
  );
}

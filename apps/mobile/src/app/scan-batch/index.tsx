import { router, Stack, useNavigation } from 'expo-router';
import { useCallback } from 'react';

import { FailureNotice } from '@/components/molecules/failure-notice';
import { SwipeToConfirm } from '@/components/molecules/swipe-to-confirm';
import { batchReviewMenu } from '@/components/organisms/batch-review-menu';
import { ScanBatchList } from '@/components/organisms/scan-batch-list';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { useScanBatch } from '@/scan/scan-batch-state';

export default function BatchReviewSheet() {
  const navigation = useNavigation();
  const { batch, commit, commitStatus, removeAll } = useScanBatch();
  const copyCount = batch.scans.length;
  const title = copyCount === 1 ? '1 card scanned' : `${copyCount} cards scanned`;

  const addToCollection = useCallback(async () => {
    const closes = (await commit()) && navigation.isFocused();
    if (closes) {
      router.back();
    }
    return closes;
  }, [commit, navigation]);

  const removeAllScans = useCallback(() => {
    removeAll();
    router.back();
  }, [removeAll]);

  const footer = (
    <>
      {commitStatus === 'failed' ? (
        <FailureNotice message="Could not add to your collection. Your scans are kept." />
      ) : null}
      <SwipeToConfirm
        label={commitStatus === 'failed' ? 'Try again' : 'Add to collection'}
        disabled={copyCount === 0}
        busy={commitStatus === 'adding'}
        onConfirm={addToCollection}
      />
    </>
  );

  return (
    <DrawerSheet footer={footer}>
      <Stack.Screen options={{ title }} />
      <Stack.Toolbar placement="right">
        {batchReviewMenu({
          scanCount: copyCount,
          hidden: commitStatus === 'adding',
          onRemoveAll: removeAllScans,
        })}
      </Stack.Toolbar>
      <ScanBatchList
        scans={[...batch.scans].reverse()}
        onOpen={
          commitStatus === 'adding'
            ? undefined
            : (scanId) => router.push({ pathname: '/scan-batch/scan-details', params: { scanId } })
        }
      />
    </DrawerSheet>
  );
}

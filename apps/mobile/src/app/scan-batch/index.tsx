import { router, Stack, useNavigation } from 'expo-router';
import { useCallback } from 'react';

import { FailureNotice } from '@/components/molecules/failure-notice';
import { SwipeToConfirm } from '@/components/molecules/swipe-to-confirm';
import { ScanBatchList } from '@/components/organisms/scan-batch-list';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { scansToAdd } from '@/scan/scan-batch';
import { useScanBatch } from '@/scan/scan-batch-state';

export default function BatchReviewSheet() {
  const navigation = useNavigation();
  const { batch, commit, commitStatus } = useScanBatch();
  const copyCount = scansToAdd(batch).length;
  const title = copyCount === 1 ? '1 card scanned' : `${copyCount} cards scanned`;

  const addToCollection = useCallback(async () => {
    const added = await commit();
    if (added && navigation.isFocused()) {
      router.back();
    }
    return added;
  }, [commit, navigation]);

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
    <DrawerSheet title={title} footer={footer}>
      <Stack.Screen options={{ title }} />
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

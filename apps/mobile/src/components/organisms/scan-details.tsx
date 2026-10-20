import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { NameSearch } from '@/components/organisms/name-search';
import { ScanDetailsContent } from '@/components/organisms/scan-details-content';
import { useBatchScan, useScanBatch } from '@/scan/scan-batch-state';

export function ScanDetails({ scanId, onRemove }: { scanId: string; onRemove: () => void }) {
  const { dispatch, notRecognizedScanId, commitStatus } = useScanBatch();
  const scan = useBatchScan(scanId);
  const notRecognized = notRecognizedScanId === scanId;
  const [searching, setSearching] = useState(false);

  const remove = () => {
    onRemove();
    dispatch({ type: 'remove', scanId });
  };

  if (notRecognized || (scan && searching)) {
    return (
      <View className="gap-lg">
        <NameSearch
          onChoose={(printing) => {
            dispatch({ type: 'choose', scanId, printing, printingChange: 'name_search' });
            setSearching(false);
          }}
        />
        {notRecognized ? (
          <Button variant="danger" onPress={remove}>
            <Text>Remove scan</Text>
          </Button>
        ) : null}
      </View>
    );
  }
  return scan ? (
    <ScanDetailsContent
      scan={scan}
      dispatch={dispatch}
      onSearch={() => setSearching(true)}
      onRemove={commitStatus === 'adding' ? undefined : remove}
    />
  ) : null;
}

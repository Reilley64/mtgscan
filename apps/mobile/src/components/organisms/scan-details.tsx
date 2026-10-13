import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { NameSearch } from '@/components/organisms/name-search';
import { ScanDetailsContent } from '@/components/organisms/scan-details-content';
import { recognizedScan } from '@/scan/scan-batch';
import { useBatchScan, useScanBatch } from '@/scan/scan-batch-state';

export function ScanDetails({ scanId, onRemove }: { scanId: string; onRemove: () => void }) {
  const { dispatch } = useScanBatch();
  const scan = useBatchScan(scanId);
  const recognized = recognizedScan(scan);
  const [searching, setSearching] = useState(false);

  const remove = () => {
    onRemove();
    dispatch({ type: 'remove', scanId });
  };

  return (
    <>
      {scan && (searching || !scan.printing) ? (
        <View className="gap-lg">
          <NameSearch
            onChoose={(printing) => {
              dispatch({ type: 'choose', scanId, printing });
              setSearching(false);
            }}
          />
          {scan.printing ? null : (
            <Button variant="danger" onPress={remove}>
              <Text>Remove scan</Text>
            </Button>
          )}
        </View>
      ) : null}
      {recognized && !searching ? (
        <ScanDetailsContent
          scan={recognized}
          dispatch={dispatch}
          onSearch={() => setSearching(true)}
          onRemove={remove}
        />
      ) : null}
    </>
  );
}

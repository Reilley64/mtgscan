import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { NameSearch } from '@/components/organisms/name-search';
import { ScanDetailsContent } from '@/components/organisms/scan-details-content';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { recognizedScan } from '@/scan/scan-batch';
import { useBatchScan, useScanBatch } from '@/scan/scan-batch-state';

export default function ScanDetailsSheet() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { dispatch } = useScanBatch();
  const scan = useBatchScan(scanId);
  const recognized = recognizedScan(scan);
  const [searching, setSearching] = useState(false);

  const remove = () => {
    router.back();
    dispatch({ type: 'remove', scanId });
  };

  return (
    <DrawerSheet>
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
    </DrawerSheet>
  );
}

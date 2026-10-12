import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { NameSearch } from '@/scan/name-search';
import { ScanDetails } from '@/scan/scan-details';
import { useBatchScan, useScanBatch } from '@/scan/scan-batch-state';
import { colors, spacing } from '@/theme';

export default function ScanDetailsSheet() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { dispatch } = useScanBatch();
  const scan = useBatchScan(scanId);
  const [searching, setSearching] = useState(false);

  const removeCopy = () => {
    if (scan?.copies === 1) {
      router.back();
    }
    dispatch({ type: 'removeCopy', scanId });
  };

  return (
    <ScrollView
      style={styles.sheet}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets>
      {scan && (searching || !scan.printing) ? (
        <NameSearch
          onChoose={(printing) => {
            dispatch({ type: 'choose', scanId, printing, source: 'search' });
            setSearching(false);
          }}
        />
      ) : null}
      {scan?.printing && !searching ? (
        <ScanDetails
          scan={{ ...scan, printing: scan.printing }}
          dispatch={dispatch}
          onSearch={() => setSearching(true)}
          onRemove={removeCopy}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: colors.sheet,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.lg * 2,
  },
});

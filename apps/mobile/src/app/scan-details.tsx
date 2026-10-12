import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';

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
        <View style={styles.search}>
          <NameSearch
            onChoose={(printing) => {
              dispatch({ type: 'choose', scanId, printing });
              setSearching(false);
            }}
          />
          {scan.printing ? null : (
            <Button variant="danger" onPress={removeCopy}>
              <Text>Remove scan</Text>
            </Button>
          )}
        </View>
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
    paddingTop: spacing.lg * 2,
    paddingBottom: spacing.lg * 2,
  },
  search: {
    gap: spacing.lg,
  },
});

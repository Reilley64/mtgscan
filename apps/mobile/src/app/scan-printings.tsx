import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { PrintingGrid } from '@/scan/printing-grid';
import { sameTextTwinsFirst, type Printing } from '@/scan/scan-batch';
import { useBatchScan, useScanBatch } from '@/scan/scan-batch-state';
import { SheetSection } from '@/scan/sheet-section';
import { colors, spacing } from '@/theme';

import { cardPrintings } from '../../modules/card-recognizer';

export default function ScanPrintingsSheet() {
  const { scanId } = useLocalSearchParams<{ scanId: string }>();
  const { dispatch } = useScanBatch();
  const scan = useBatchScan(scanId);
  const oracleId = scan?.printing?.oracleId;
  const [printings, setPrintings] = useState<{ oracleId: string; printings: Printing[] } | null>(null);

  useEffect(() => {
    if (!oracleId) {
      return;
    }
    let current = true;
    cardPrintings(oracleId).then(
      (found) => current && setPrintings({ oracleId, printings: found }),
      () => current && setPrintings({ oracleId, printings: [] }),
    );
    return () => {
      current = false;
    };
  }, [oracleId]);

  const cardPrintingsOfScan = printings?.oracleId === oracleId ? printings?.printings : undefined;

  return (
    <ScrollView style={styles.sheet} contentContainerStyle={styles.content}>
      {scan?.printing && cardPrintingsOfScan ? (
        <SheetSection title={scan.printing.name}>
          <PrintingGrid
            printings={sameTextTwinsFirst(scan, cardPrintingsOfScan)}
            selectedId={scan.printing.printingId}
            onChoose={(printing) => {
              dispatch({ type: 'choose', scanId, printing, source: 'scan' });
              router.back();
            }}
          />
        </SheetSection>
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

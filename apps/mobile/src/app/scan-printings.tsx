import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { SheetSection } from '@/components/molecules/sheet-section';
import { PrintingPicker } from '@/components/organisms/printing-picker';
import { DrawerSheet } from '@/components/templates/drawer-sheet';
import { sameTextTwinsFirst, type Printing } from '@/scan/scan-batch';
import { useBatchScan, useScanBatch } from '@/scan/scan-batch-state';

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
    <DrawerSheet>
      {scan?.printing && cardPrintingsOfScan ? (
        <SheetSection title={scan.printing.name}>
          <PrintingPicker
            printings={sameTextTwinsFirst(scan, cardPrintingsOfScan)}
            selectedId={scan.printing.printingId}
            onChoose={(printing) => {
              dispatch({ type: 'choose', scanId, printing });
              router.back();
            }}
          />
        </SheetSection>
      ) : null}
    </DrawerSheet>
  );
}

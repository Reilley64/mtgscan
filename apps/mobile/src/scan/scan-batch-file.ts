import { File, Paths } from 'expo-file-system';

import { emptyScanBatch, type BatchScan, type ScanBatch } from './scan-batch';

const formatVersion = 2;

type ScanOfVersion1 = Omit<BatchScan, 'recognizedPrintingId' | 'printingChange' | 'printingConfirmed' | 'trainingCrop'>;

function scanOfVersion1(scan: ScanOfVersion1): BatchScan {
  return {
    ...scan,
    recognizedPrintingId: scan.options[0]?.printingId ?? null,
    printingChange: null,
    printingConfirmed: false,
    trainingCrop: null,
  };
}

function savedScans(savedVersion: unknown, scans: unknown[]): BatchScan[] | null {
  if (savedVersion === formatVersion) {
    return scans as BatchScan[];
  }
  return savedVersion === 1 ? (scans as ScanOfVersion1[]).map(scanOfVersion1) : null;
}

function scanBatchFile(userId: string) {
  return new File(Paths.document, `scan-batch-${userId}.json`);
}

export async function readScanBatch(userId: string): Promise<ScanBatch> {
  const file = scanBatchFile(userId);
  if (!file.exists) {
    return emptyScanBatch;
  }
  try {
    const { formatVersion: savedVersion, scans, commitPending } = JSON.parse(await file.text());
    const loaded = savedScans(savedVersion, scans);
    return loaded
      ? { scans: loaded.filter((scan) => scan.printing), commitPending: commitPending === true }
      : emptyScanBatch;
  } catch {
    return emptyScanBatch;
  }
}

export function writeScanBatch(userId: string, batch: ScanBatch) {
  scanBatchFile(userId).write(JSON.stringify({ formatVersion, ...batch }));
}

import { File, Paths } from 'expo-file-system';

import { emptyScanBatch, type ScanBatch } from './scan-batch';

const formatVersion = 1;

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
    return savedVersion === formatVersion
      ? { scans: scans.filter((scan: { printing: unknown }) => scan.printing), commitPending: commitPending === true }
      : emptyScanBatch;
  } catch {
    return emptyScanBatch;
  }
}

export function writeScanBatch(userId: string, batch: ScanBatch) {
  scanBatchFile(userId).write(JSON.stringify({ formatVersion, ...batch }));
}

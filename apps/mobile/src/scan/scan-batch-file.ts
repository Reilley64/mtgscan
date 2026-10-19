import { emptyScanBatch, type BatchScan, type ScanBatch } from './scan-batch';
import { versionedUserFile } from './versioned-user-file';

const formatVersion = 2;

type ScanOfVersion1 = Omit<BatchScan, 'recognizedPrintingId' | 'printingChange' | 'printingConfirmed' | 'trainingCrop'>;

function scanOfVersion1(scan: ScanOfVersion1): BatchScan {
  return { ...scan, recognizedPrintingId: null, printingChange: null, printingConfirmed: false, trainingCrop: null };
}

function savedScans(savedVersion: unknown, scans: unknown): BatchScan[] | null {
  if (savedVersion === formatVersion) {
    return scans as BatchScan[];
  }
  return savedVersion === 1 ? (scans as ScanOfVersion1[]).map(scanOfVersion1) : null;
}

function scanBatchFile(userId: string) {
  return versionedUserFile('scan-batch', userId, formatVersion);
}

export async function readScanBatch(userId: string): Promise<ScanBatch> {
  const batch = await scanBatchFile(userId).read(({ formatVersion: savedVersion, scans, commitPending }) => {
    const loaded = savedScans(savedVersion, scans);
    return loaded && { scans: loaded.filter((scan) => scan.printing), commitPending: commitPending === true };
  });
  return batch ?? emptyScanBatch;
}

export function writeScanBatch(userId: string, batch: ScanBatch) {
  scanBatchFile(userId).write(batch);
}

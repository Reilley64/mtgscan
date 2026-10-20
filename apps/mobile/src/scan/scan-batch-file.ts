import { emptyScanBatch, type BatchScan, type ScanBatch, type ScanTrainingCrop } from './scan-batch';
import { versionedUserFile } from './versioned-user-file';

const formatVersion = 3;

type ScanOfVersion1 = Omit<BatchScan, 'recognizedPrintingId' | 'printingChange' | 'printingConfirmed' | 'trainingCrop'>;

type ScanOfVersion2 = Omit<BatchScan, 'trainingCrop'> & { trainingCrop: (ScanTrainingCrop & { uri: string }) | null };

function scanOfVersion1(scan: ScanOfVersion1): BatchScan {
  return { ...scan, recognizedPrintingId: null, printingChange: null, printingConfirmed: false, trainingCrop: null };
}

function scanOfVersion2({ trainingCrop, ...scan }: ScanOfVersion2): BatchScan {
  if (!trainingCrop) {
    return { ...scan, trainingCrop };
  }
  const { uri, ...crop } = trainingCrop;
  return { ...scan, trainingCrop: crop };
}

function savedScans(savedVersion: unknown, scans: unknown): BatchScan[] | null {
  switch (savedVersion) {
    case formatVersion:
      return scans as BatchScan[];
    case 2:
      return (scans as ScanOfVersion2[]).map(scanOfVersion2);
    case 1:
      return (scans as ScanOfVersion1[]).map(scanOfVersion1);
    default:
      return null;
  }
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

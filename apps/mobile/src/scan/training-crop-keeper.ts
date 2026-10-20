import { getRandomValues, randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { evidenceRecordOf, type EvidenceRecord } from './evidence-record';
import { isCroppedScan, type BatchScan, type ScanBatch } from './scan-batch';
import { versionedUserFile } from './versioned-user-file';

export type WaitingTrainingCrop = {
  cropId: string;
  copyId: string;
  uploadAt: number;
  record: EvidenceRecord;
};

export type UploadResult = 'done' | 'refused' | 'failed';

const queueFormatVersion = 3;
const day = 24 * 60 * 60 * 1000;

function dropFile(file: File) {
  if (file.exists) {
    file.delete();
  }
}

function croppedCopyIds(scans: readonly BatchScan[]) {
  return new Set(scans.filter((scan) => scan.trainingCrop).map((scan) => scan.scanId));
}

function savedCrops(savedVersion: unknown, crops: unknown): WaitingTrainingCrop[] | null {
  return savedVersion === queueFormatVersion ? (crops as WaitingTrainingCrop[]) : null;
}

let queueLock: Promise<unknown> = Promise.resolve();

function withQueueLock<T>(job: () => Promise<T>): Promise<T> {
  const run = queueLock.then(job);
  queueLock = run.catch(() => {});
  return run;
}

function uploadWait() {
  const [drawn] = getRandomValues(new Uint32Array(1));
  return day + (drawn! / 2 ** 32) * 6 * day;
}

export function trainingCropKeeper(userId: string) {
  const directory = new Directory(Paths.document, 'training-crops', userId);
  const queueFile = versionedUserFile('training-crop-queue', userId, queueFormatVersion);
  const keptThisSession = new Set<string>();
  let inScanBatch = new Set<string>();

  const fileName = (copyId: string) => `${copyId}.webp`;
  const cropFile = (copyId: string) => new File(directory, fileName(copyId));

  async function readQueue(): Promise<WaitingTrainingCrop[]> {
    return (await queueFile.read(({ formatVersion, crops }) => savedCrops(formatVersion, crops))) ?? [];
  }

  function writeQueue(crops: readonly WaitingTrainingCrop[]) {
    queueFile.write({ crops });
  }

  function drop(copyIds: readonly string[]) {
    copyIds.forEach((copyId) => dropFile(cropFile(copyId)));
  }

  function queue(scans: readonly BatchScan[]) {
    const committedAt = Date.now();
    const crops = scans.filter(isCroppedScan).map((scan) => ({
      cropId: randomUUID(),
      copyId: scan.scanId,
      uploadAt: committedAt + uploadWait(),
      record: evidenceRecordOf(scan),
    }));
    return withQueueLock(async () => writeQueue([...(await readQueue()), ...crops]));
  }

  return {
    userId,
    drop,
    keep(cropUri: string, copyId: string) {
      try {
        directory.create({ intermediates: true, idempotent: true });
        new File(cropUri).moveSync(cropFile(copyId));
        keptThisSession.add(copyId);
        return true;
      } catch {
        return false;
      }
    },
    discard(cropUri: string) {
      dropFile(new File(cropUri));
    },
    scanBatchRestored(batch: ScanBatch) {
      const restored = croppedCopyIds(batch.scans);
      inScanBatch = new Set([...restored, ...keptThisSession]);
      return withQueueLock(async () => {
        if (!directory.exists) {
          return;
        }
        const waiting = (await readQueue()).map(({ copyId }) => copyId);
        const keptFileNames = new Set([...restored, ...keptThisSession, ...waiting].map(fileName));
        directory
          .list()
          .filter((file) => !keptFileNames.has(file.name))
          .forEach((file) => file.delete());
      });
    },
    dropCropsOfScansThatLeft(batch: ScanBatch) {
      const cropped = croppedCopyIds(batch.scans);
      drop([...inScanBatch].filter((copyId) => !cropped.has(copyId)));
      inScanBatch = cropped;
    },
    scanBatchCommitted(scans: readonly BatchScan[], uploadsOn: boolean | null) {
      scans.forEach(({ scanId }) => inScanBatch.delete(scanId));
      if (uploadsOn === false) {
        drop(scans.map(({ scanId }) => scanId));
      } else {
        void queue(scans);
      }
    },
    dropWaiting() {
      return withQueueLock(async () => {
        drop((await readQueue()).map(({ copyId }) => copyId));
        writeQueue([]);
      });
    },
    uploadDue(upload: (crop: WaitingTrainingCrop, imageUri: string) => Promise<UploadResult>, stillSignedIn: () => boolean) {
      return withQueueLock(async () => {
        let waiting = await readQueue();
        for (const crop of waiting.filter(({ uploadAt }) => uploadAt <= Date.now())) {
          const image = cropFile(crop.copyId);
          if (!stillSignedIn() || (image.exists && (await upload(crop, image.uri)) === 'failed')) {
            return;
          }
          dropFile(image);
          waiting = waiting.filter(({ cropId }) => cropId !== crop.cropId);
          writeQueue(waiting);
        }
      });
    },
  };
}

export type TrainingCropKeeper = ReturnType<typeof trainingCropKeeper>;

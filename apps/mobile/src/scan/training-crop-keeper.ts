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

const queueFormatVersion = 2;
const day = 24 * 60 * 60 * 1000;

function cropDirectory(userId: string) {
  return new Directory(Paths.document, 'training-crops', userId);
}

function cropFileName(copyId: string) {
  return `${copyId}.jpg`;
}

function cropFile(userId: string, copyId: string) {
  return new File(cropDirectory(userId), cropFileName(copyId));
}

function dropFile(file: File) {
  if (file.exists) {
    file.delete();
  }
}

export function dropTrainingCropAt(uri: string) {
  dropFile(new File(uri));
}

function croppedCopyIds(scans: readonly BatchScan[]) {
  return new Set(scans.filter((scan) => scan.trainingCrop).map((scan) => scan.scanId));
}

function queueFile(userId: string) {
  return versionedUserFile('training-crop-queue', userId, queueFormatVersion);
}

type WaitingTrainingCropOfVersion1 = WaitingTrainingCrop & { uri: string };

function savedCrops(savedVersion: unknown, crops: unknown): WaitingTrainingCrop[] | null {
  if (savedVersion === queueFormatVersion) {
    return crops as WaitingTrainingCrop[];
  }
  return savedVersion === 1 ? (crops as WaitingTrainingCropOfVersion1[]).map(({ uri, ...crop }) => crop) : null;
}

async function readQueue(userId: string): Promise<WaitingTrainingCrop[]> {
  const crops = await queueFile(userId).read(({ formatVersion, crops }) => savedCrops(formatVersion, crops));
  return crops ?? [];
}

function writeQueue(userId: string, crops: readonly WaitingTrainingCrop[]) {
  queueFile(userId).write({ crops });
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

function queueTrainingCrops(userId: string, scans: readonly BatchScan[]) {
  const committedAt = Date.now();
  const kept = scans.filter(isCroppedScan).map((scan) => ({
    cropId: randomUUID(),
    copyId: scan.scanId,
    uploadAt: committedAt + uploadWait(),
    record: evidenceRecordOf(scan),
  }));
  return withQueueLock(async () => writeQueue(userId, [...(await readQueue(userId)), ...kept]));
}

export function dropWaitingTrainingCrops(userId: string) {
  return withQueueLock(async () => {
    (await readQueue(userId)).forEach(({ copyId }) => dropFile(cropFile(userId, copyId)));
    writeQueue(userId, []);
  });
}

export function uploadDueTrainingCrops(
  userId: string,
  upload: (crop: WaitingTrainingCrop, imageUri: string) => Promise<UploadResult>,
  stillSignedIn: () => boolean,
) {
  return withQueueLock(async () => {
    let waiting = await readQueue(userId);
    for (const crop of waiting.filter(({ uploadAt }) => uploadAt <= Date.now())) {
      const image = cropFile(userId, crop.copyId);
      if (!stillSignedIn() || (image.exists && (await upload(crop, image.uri)) === 'failed')) {
        return;
      }
      dropFile(image);
      waiting = waiting.filter(({ cropId }) => cropId !== crop.cropId);
      writeQueue(userId, waiting);
    }
  });
}

export function trainingCropKeeper(userId: string) {
  const keptThisSession = new Set<string>();
  let inScanBatch = new Set<string>();

  function drop(copyIds: string[]) {
    copyIds.forEach((copyId) => dropFile(cropFile(userId, copyId)));
  }

  return {
    keep(cropUri: string, copyId: string): string | null {
      try {
        cropDirectory(userId).create({ intermediates: true, idempotent: true });
        const crop = new File(cropUri);
        crop.moveSync(cropFile(userId, copyId));
        keptThisSession.add(copyId);
        return crop.uri;
      } catch {
        return null;
      }
    },
    scanBatchRestored(batch: ScanBatch) {
      inScanBatch = croppedCopyIds(batch.scans);
      const restored = [...inScanBatch];
      return withQueueLock(async () => {
        const directory = cropDirectory(userId);
        if (!directory.exists) {
          return;
        }
        const waiting = (await readQueue(userId)).map(({ copyId }) => copyId);
        const listed = new Set([...restored, ...keptThisSession, ...waiting].map(cropFileName));
        directory
          .list()
          .filter((file) => !listed.has(file.name))
          .forEach((file) => file.delete());
      });
    },
    scanBatchSaved(batch: ScanBatch) {
      const cropped = croppedCopyIds(batch.scans);
      drop([...inScanBatch].filter((copyId) => !cropped.has(copyId)));
      inScanBatch = cropped;
    },
    scanBatchCommitted(scans: readonly BatchScan[], uploadsOn: boolean | null) {
      scans.forEach(({ scanId }) => inScanBatch.delete(scanId));
      if (uploadsOn === false) {
        drop(scans.map(({ scanId }) => scanId));
      } else {
        void queueTrainingCrops(userId, scans);
      }
    },
  };
}

export type TrainingCropKeeper = ReturnType<typeof trainingCropKeeper>;

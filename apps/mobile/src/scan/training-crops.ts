import { FunctionsHttpError } from '@supabase/supabase-js';
import { getRandomValues, randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase';

import { evidenceRecordOf, type EvidenceRecord } from './evidence-record';
import { isCroppedScan, type BatchScan } from './scan-batch';

type WaitingTrainingCrop = {
  cropId: string;
  copyId: string;
  uri: string;
  uploadAt: number;
  record: EvidenceRecord;
};

const formatVersion = 1;
const day = 24 * 60 * 60 * 1000;

export function keepTrainingCrop(cropUri: string, userId: string, copyId: string): string | null {
  try {
    const directory = new Directory(Paths.document, 'training-crops', userId);
    directory.create({ intermediates: true, idempotent: true });
    const crop = new File(cropUri);
    crop.moveSync(new File(directory, `${copyId}.jpg`));
    return crop.uri;
  } catch {
    return null;
  }
}

export function dropTrainingCrop(cropUri: string) {
  const crop = new File(cropUri);
  if (crop.exists) {
    crop.delete();
  }
}

export function dropTrainingCropsOf(scans: readonly BatchScan[]) {
  for (const scan of scans) {
    if (scan.trainingCrop) {
      dropTrainingCrop(scan.trainingCrop.uri);
    }
  }
}

function queueFile(userId: string) {
  return new File(Paths.document, `training-crop-queue-${userId}.json`);
}

async function readQueue(userId: string): Promise<WaitingTrainingCrop[]> {
  const file = queueFile(userId);
  if (!file.exists) {
    return [];
  }
  try {
    const { formatVersion: savedVersion, crops } = JSON.parse(await file.text());
    return savedVersion === formatVersion ? crops : [];
  } catch {
    return [];
  }
}

function writeQueue(userId: string, crops: readonly WaitingTrainingCrop[]) {
  queueFile(userId).write(JSON.stringify({ formatVersion, crops }));
}

let queueWork: Promise<unknown> = Promise.resolve();

function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const run = queueWork.then(job);
  queueWork = run.catch(() => {});
  return run;
}

function uploadWait() {
  const [drawn] = getRandomValues(new Uint32Array(1));
  return day + (drawn! / 2 ** 32) * 6 * day;
}

export function queueTrainingCrops(userId: string, scans: readonly BatchScan[]) {
  const committedAt = Date.now();
  const kept = scans.filter(isCroppedScan).map((scan) => ({
    cropId: randomUUID(),
    copyId: scan.scanId,
    uri: scan.trainingCrop.uri,
    uploadAt: committedAt + uploadWait(),
    record: evidenceRecordOf(scan),
  }));
  return inTurn(async () => writeQueue(userId, [...(await readQueue(userId)), ...kept]));
}

export function dropWaitingTrainingCrops(userId: string) {
  return inTurn(async () => {
    (await readQueue(userId)).forEach(({ uri }) => dropTrainingCrop(uri));
    writeQueue(userId, []);
  });
}

type UploadResult = 'done' | 'refused' | 'failed';

async function uploadTrainingCrop({ cropId, copyId, uri, record }: WaitingTrainingCrop): Promise<UploadResult> {
  const body = new FormData();
  body.append('image', { uri, name: 'crop.jpg', type: 'image/jpeg' } as unknown as Blob);
  body.append('copy_id', copyId);
  body.append('crop', JSON.stringify({ crop_id: cropId, ...record }));
  const { error } = await supabase.functions.invoke('training-crops', { body });
  if (!error) {
    return 'done';
  }
  return error instanceof FunctionsHttpError && error.context.status === 400 ? 'refused' : 'failed';
}

function uploadDueTrainingCrops(userId: string, stillSignedIn: () => boolean) {
  return inTurn(async () => {
    let waiting = await readQueue(userId);
    for (const crop of waiting.filter(({ uploadAt }) => uploadAt <= Date.now())) {
      if (!stillSignedIn() || (await uploadTrainingCrop(crop)) === 'failed') {
        return;
      }
      dropTrainingCrop(crop.uri);
      waiting = waiting.filter(({ cropId }) => cropId !== crop.cropId);
      writeQueue(userId, waiting);
    }
  });
}

export function useTrainingCropUploads(userId: string | undefined) {
  useEffect(() => {
    if (!userId) {
      return;
    }
    let signedIn = true;
    const stillSignedIn = () => signedIn;
    void uploadDueTrainingCrops(userId, stillSignedIn);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void uploadDueTrainingCrops(userId, stillSignedIn);
      }
    });
    return () => {
      signedIn = false;
      subscription.remove();
    };
  }, [userId]);
}

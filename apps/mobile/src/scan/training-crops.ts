import { FunctionsHttpError } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { supabase } from '@/lib/supabase';

import { evidenceRecordOf } from './evidence-record';
import { isCroppedScan, type BatchScan, type CroppedScan } from './scan-batch';

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

async function uploadTrainingCrop(scan: CroppedScan) {
  const body = new FormData();
  body.append('image', { uri: scan.trainingCrop.uri, name: 'crop.jpg', type: 'image/jpeg' } as unknown as Blob);
  body.append('copy_id', scan.scanId);
  body.append('crop', JSON.stringify({ crop_id: randomUUID(), ...evidenceRecordOf(scan) }));
  const { error } = await supabase.functions.invoke('training-crops', { body });
  if (!error || (error instanceof FunctionsHttpError && error.context.status === 400)) {
    dropTrainingCrop(scan.trainingCrop.uri);
  }
}

export async function uploadTrainingCrops(scans: readonly BatchScan[]) {
  for (const scan of scans.filter(isCroppedScan)) {
    await uploadTrainingCrop(scan);
  }
}

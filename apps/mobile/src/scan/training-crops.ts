import { FunctionsHttpError } from '@supabase/supabase-js';
import { randomUUID } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';

import { supabase } from '@/lib/supabase';

import { evidenceRecordOf } from './evidence-record';
import type { BatchScan, ScanTrainingCrop } from './scan-batch';

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

async function uploadTrainingCrop(scan: BatchScan, trainingCrop: ScanTrainingCrop) {
  const body = new FormData();
  body.append('image', { uri: trainingCrop.uri, name: 'crop.jpg', type: 'image/jpeg' } as unknown as Blob);
  body.append('copy_id', scan.scanId);
  body.append('crop', JSON.stringify({ crop_id: randomUUID(), ...evidenceRecordOf(scan, trainingCrop) }));
  const { error } = await supabase.functions.invoke('training-crops', { body });
  if (!error || (error instanceof FunctionsHttpError && error.context.status === 400)) {
    dropTrainingCrop(trainingCrop.uri);
  }
}

export async function uploadTrainingCrops(scans: readonly BatchScan[]) {
  for (const scan of scans) {
    if (scan.trainingCrop) {
      await uploadTrainingCrop(scan, scan.trainingCrop);
    }
  }
}

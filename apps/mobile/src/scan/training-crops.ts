import { FunctionsHttpError } from '@supabase/supabase-js';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/auth/session';
import { supabase } from '@/lib/supabase';

import { trainingCropKeeper, type UploadResult, type WaitingTrainingCrop } from './training-crop-keeper';

async function uploadTrainingCrop({ cropId, copyId, record }: WaitingTrainingCrop, imageUri: string): Promise<UploadResult> {
  const body = new FormData();
  body.append('image', { uri: imageUri, name: 'crop.webp', type: 'image/webp' } as unknown as Blob);
  body.append('copy_id', copyId);
  body.append('crop', JSON.stringify({ crop_id: cropId, ...record }));
  const { error } = await supabase.functions.invoke('training-crops', { body });
  if (!error) {
    return 'done';
  }
  return error instanceof FunctionsHttpError && error.context.status === 400 ? 'refused' : 'failed';
}

export function TrainingCropUploads() {
  const userId = useSession()?.user.id;
  useEffect(() => {
    if (!userId) {
      return;
    }
    const keeper = trainingCropKeeper(userId);
    let signedIn = true;
    const stillSignedIn = () => signedIn;
    void keeper.uploadDue(uploadTrainingCrop, stillSignedIn);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void keeper.uploadDue(uploadTrainingCrop, stillSignedIn);
      }
    });
    return () => {
      signedIn = false;
      subscription.remove();
    };
  }, [userId]);
  return null;
}

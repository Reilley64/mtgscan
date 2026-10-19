import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { TrainingCropSettings } from '@mtgscan/supabase/training-crops';
import { createContext, use, type ReactNode } from 'react';

import { useSession } from '@/auth/session';
import { databaseRead, useAppRead } from '@/lib/read';
import { supabase } from '@/lib/supabase';

import { dropWaitingTrainingCrops } from './training-crops';

type TrainingCropUploadsSetting = {
  uploadsOn: boolean | null;
  setUploadsOn: (on: boolean) => Promise<boolean>;
};

const settingsRead = databaseRead(databaseFunctions.get_training_crop_settings);

function loadedSetting({ uploads_on }: TrainingCropSettings) {
  return { status: 'loaded' as const, uploadsOn: uploads_on };
}

const TrainingCropUploadsContext = createContext<TrainingCropUploadsSetting | null>(null);

export function TrainingCropUploadsSettingProvider({ children }: { children: ReactNode }) {
  const userId = useSession()?.user.id;
  const { read, replaceReply } = useAppRead(userId ? settingsRead : null, loadedSetting, {
    key: [userId],
    whenAppActive: true,
    staleTime: Infinity,
  });
  const uploadsOn = read.status === 'loaded' ? read.uploadsOn : null;

  async function setUploadsOn(on: boolean) {
    if (!userId) {
      return false;
    }
    replaceReply({ uploads_on: on });
    const result = await callDatabaseFunction(supabase, databaseFunctions.set_training_crop_uploads, { on });
    if (result.status !== 'replied') {
      replaceReply({ uploads_on: !on });
      return false;
    }
    if (!on) {
      await dropWaitingTrainingCrops(userId);
    }
    return true;
  }

  return <TrainingCropUploadsContext value={{ uploadsOn, setUploadsOn }}>{children}</TrainingCropUploadsContext>;
}

export function useTrainingCropUploadsSetting(): TrainingCropUploadsSetting {
  const setting = use(TrainingCropUploadsContext);
  if (!setting) {
    throw new Error('useTrainingCropUploadsSetting needs a TrainingCropUploadsSettingProvider');
  }
  return setting;
}

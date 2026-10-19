import type { SetTrainingCropUploadsRequest, TrainingCropSettings } from '@mtgscan/supabase/training-crops';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/auth/session';
import { supabase } from '@/lib/supabase';

import { dropWaitingTrainingCrops } from './training-crops';

type TrainingCropUploadsSetting = {
  uploadsOn: boolean | null;
  setUploadsOn: (on: boolean) => Promise<boolean>;
};

type KnownSetting = { userId: string; uploadsOn: boolean };

const TrainingCropUploadsContext = createContext<TrainingCropUploadsSetting | null>(null);

export function TrainingCropUploadsSettingProvider({ children }: { children: ReactNode }) {
  const userId = useSession()?.user.id;
  const [known, setKnown] = useState<KnownSetting | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);
  const uploadsOn = userId && known?.userId === userId ? known.uploadsOn : null;

  useEffect(() => {
    if (!userId) {
      return;
    }
    let current = true;
    supabase.rpc('get_training_crop_settings').then(({ data }) => {
      if (current && data) {
        setKnown({ userId, uploadsOn: (data as unknown as TrainingCropSettings).uploads_on });
      }
    });
    return () => {
      current = false;
    };
  }, [userId, readAttempt]);

  useEffect(() => {
    if (uploadsOn !== null) {
      return;
    }
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setReadAttempt((attempt) => attempt + 1);
      }
    });
    return () => subscription.remove();
  }, [uploadsOn]);

  const setUploadsOn = useCallback(
    async (on: boolean) => {
      if (!userId) {
        return false;
      }
      setKnown({ userId, uploadsOn: on });
      const request: SetTrainingCropUploadsRequest = { on };
      const { error } = await supabase.rpc('set_training_crop_uploads', { request });
      if (error) {
        setKnown({ userId, uploadsOn: !on });
        return false;
      }
      if (!on) {
        await dropWaitingTrainingCrops(userId);
      }
      return true;
    },
    [userId],
  );

  const setting = useMemo(() => ({ uploadsOn, setUploadsOn }), [setUploadsOn, uploadsOn]);

  return <TrainingCropUploadsContext value={setting}>{children}</TrainingCropUploadsContext>;
}

export function useTrainingCropUploadsSetting(): TrainingCropUploadsSetting {
  const setting = use(TrainingCropUploadsContext);
  if (!setting) {
    throw new Error('useTrainingCropUploadsSetting needs a TrainingCropUploadsSettingProvider');
  }
  return setting;
}

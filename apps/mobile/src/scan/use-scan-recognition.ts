import { useCallback, useEffect, useMemo } from 'react';

import { deletePhoto, type CapturedPhoto } from '../../modules/card-detector';
import { recognize, type Recognition } from '../../modules/card-recognizer';
import { outcomeOf, useScanBatch } from './scan-batch-state';
import { playScanFeedback } from './scan-feedback';
import { preloadScanSounds } from './scan-sounds';
import { useScanSounds } from './scan-sounds-setting';
import type { PhotoHandlers } from './use-automatic-capture';

async function recognizePhoto(photo: CapturedPhoto): Promise<Recognition | 'failed'> {
  try {
    return await recognize(photo.uri, photo.outline);
  } catch {
    return 'failed';
  } finally {
    void deletePhoto(photo.uri);
  }
}

export function useScanRecognition(): PhotoHandlers {
  const { recognitionStarted, recognitionEnded } = useScanBatch();
  const { scanSounds } = useScanSounds();

  useEffect(() => {
    if (scanSounds) {
      preloadScanSounds().catch(() => {});
    }
  }, [scanSounds]);

  const onPhoto = useCallback(
    async (photo: CapturedPhoto) => {
      const recognition = await recognizePhoto(photo);
      recognitionEnded(recognition);
      playScanFeedback(outcomeOf(recognition), scanSounds);
    },
    [recognitionEnded, scanSounds],
  );

  const onPhotoFailed = useCallback(() => recognitionEnded('no_photo'), [recognitionEnded]);

  return useMemo(
    () => ({ onPhotoRequested: recognitionStarted, onPhoto: (photo) => void onPhoto(photo), onPhotoFailed }),
    [onPhoto, onPhotoFailed, recognitionStarted],
  );
}

import { useCallback, useEffect, useMemo, useRef } from 'react';

import { deletePhoto, type CapturedPhoto } from '../../modules/card-detector';
import { recognize, type Recognition } from '../../modules/card-recognizer';
import { outcomeOf, useScanBatch } from './scan-batch-state';
import { playScanFeedback } from './scan-feedback';
import { logScan } from './scan-log';
import { preloadScanSounds } from './scan-sounds';
import { useScanSounds } from './scan-sounds-setting';
import type { PhotoHandlers } from './use-automatic-capture';

async function recognizePhoto(photo: CapturedPhoto, photoRequestedAt: number): Promise<Recognition | 'failed'> {
  try {
    const recognition = await recognize(photo.uri, photo.outline);
    logScan(photoRequestedAt, recognition);
    return recognition;
  } catch (error) {
    logScan(photoRequestedAt, { kind: 'failed', error: (error as { code?: string }).code ?? String(error) });
    return 'failed';
  } finally {
    void deletePhoto(photo.uri);
  }
}

export function useScanRecognition(): PhotoHandlers {
  const { recognitionStarted, recognitionEnded } = useScanBatch();
  const { scanSounds } = useScanSounds();
  const photoRequests = useRef<number[]>([]);

  useEffect(() => {
    if (scanSounds) {
      preloadScanSounds().catch(() => {});
    }
  }, [scanSounds]);

  const onPhotoRequested = useCallback(() => {
    photoRequests.current.push(Date.now());
    recognitionStarted();
  }, [recognitionStarted]);

  const onPhoto = useCallback(
    async (photo: CapturedPhoto) => {
      const recognition = await recognizePhoto(photo, photoRequests.current.shift() ?? Date.now());
      recognitionEnded(recognition);
      playScanFeedback(outcomeOf(recognition), scanSounds);
    },
    [recognitionEnded, scanSounds],
  );

  const onPhotoFailed = useCallback(() => {
    photoRequests.current.shift();
    recognitionEnded('no_photo');
  }, [recognitionEnded]);

  return useMemo(
    () => ({ onPhotoRequested, onPhoto: (photo) => void onPhoto(photo), onPhotoFailed }),
    [onPhoto, onPhotoFailed, onPhotoRequested],
  );
}

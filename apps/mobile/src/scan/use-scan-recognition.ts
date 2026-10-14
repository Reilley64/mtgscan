import { useCallback, useEffect, useMemo } from 'react';

import { deletePhoto, type CapturedPhoto } from '../../modules/card-detector';
import { recognize, type Recognition } from '../../modules/card-recognizer';
import { errorCode } from '@/lib/error-code';
import { useScanBatch } from './scan-batch-state';
import { logRecognition } from './recognition-log';
import { preloadScanSounds } from './scan-sounds';
import { useScanSounds } from './scan-sounds-setting';
import type { PhotoHandlers } from './use-automatic-capture';

async function recognizePhoto(photo: CapturedPhoto, photoRequestedAt: number): Promise<Recognition | 'failed'> {
  try {
    const recognition = await recognize(photo.uri, photo.outline);
    logRecognition(photoRequestedAt, recognition);
    return recognition;
  } catch (error) {
    logRecognition(photoRequestedAt, { kind: 'failed', error: errorCode(error) });
    return 'failed';
  } finally {
    void deletePhoto(photo.uri);
  }
}

type PhotoRequest = { requestedAt: number; photoId: string };

export function useScanRecognition(): PhotoHandlers<PhotoRequest> {
  const { recognitionStarted, recognitionEnded } = useScanBatch();
  const { scanSounds } = useScanSounds();

  useEffect(() => {
    if (scanSounds) {
      preloadScanSounds().catch(() => {});
    }
  }, [scanSounds]);

  const onPhotoRequested = useCallback(
    () => ({ requestedAt: Date.now(), photoId: recognitionStarted() }),
    [recognitionStarted],
  );

  const onPhoto = useCallback(
    async (photo: CapturedPhoto, { requestedAt, photoId }: PhotoRequest) => {
      recognitionEnded(photoId, await recognizePhoto(photo, requestedAt));
    },
    [recognitionEnded],
  );

  const onPhotoFailed = useCallback(
    ({ photoId }: PhotoRequest) => recognitionEnded(photoId, 'no_photo'),
    [recognitionEnded],
  );

  return useMemo(
    () => ({ onPhotoRequested, onPhoto: (photo, request) => void onPhoto(photo, request), onPhotoFailed }),
    [onPhoto, onPhotoFailed, onPhotoRequested],
  );
}

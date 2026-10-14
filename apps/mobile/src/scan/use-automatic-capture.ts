import { useCallback, useRef, useState } from 'react';

import type {
  CapturedPhoto,
  CardDetectorCamera,
  CardDetectorViewProps,
  FrameQuad,
} from '../../modules/card-detector';
import { initialCapture, isStopped, observeSample, photoFailed, photoTaken, type CaptureState } from './capture';
import { createCaptureLog } from './capture-log';

export type PhotoHandlers<Request> = {
  onPhotoRequested: () => Request;
  onPhoto: (photo: CapturedPhoto, request: Request) => void;
  onPhotoFailed: (request: Request) => void;
};

export function useAutomaticCapture<Request>({ onPhotoRequested, onPhoto, onPhotoFailed }: PhotoHandlers<Request>) {
  const camera = useRef<CardDetectorCamera>(null);
  const capture = useRef<CaptureState>(initialCapture());
  const [log] = useState(createCaptureLog);
  const [stopped, setStopped] = useState(false);

  const update = useCallback((state: CaptureState) => {
    capture.current = state;
    setStopped(isStopped(state));
  }, []);

  const takePhoto = useCallback(async (outline: FrameQuad) => {
    const request = onPhotoRequested();
    let photo: CapturedPhoto;
    try {
      if (!camera.current) {
        throw new Error('The camera is not ready');
      }
      photo = await camera.current.takePhoto(outline);
    } catch {
      update(photoFailed(capture.current));
      log.photoFailed(capture.current);
      onPhotoFailed(request);
      return;
    }
    update(photoTaken(capture.current));
    log.photoTaken();
    onPhoto(photo, request);
  }, [log, onPhoto, onPhotoFailed, onPhotoRequested, update]);

  const onDetectionSample = useCallback<CardDetectorViewProps['onDetectionSample']>(
    ({ nativeEvent }) => {
      const step = observeSample(capture.current, nativeEvent);
      log.sample(capture.current, step, nativeEvent);
      update(step.state);
      if (step.requestPhoto && nativeEvent.corners) {
        void takePhoto(nativeEvent.corners);
      }
    },
    [log, takePhoto, update],
  );

  const tryAgain = useCallback(() => update(initialCapture()), [update]);

  return { camera, onDetectionSample, stopped, tryAgain };
}

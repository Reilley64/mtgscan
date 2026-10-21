import { logForDevelopment } from '@/lib/development-log';

import type { CapturedPhoto } from '../../modules/card-detector';
import type { Recognition, RecognizerTimes } from '../../modules/card-recognizer';

export type ScanPhases = {
  photoRequest: number;
  photoCapture: number;
  photoProcessing: number;
  photoSave: number;
  photoHandOff: number;
  recognizerCall: number;
  recognizer: number;
  recognitionHandOff: number;
};

type ScanTimes = {
  photoRequestedAt: number;
  photo: CapturedPhoto;
  recognizeCalledAt: number;
  recognizer: RecognizerTimes;
};

export type LoggedRecognition = Recognition | { kind: 'failed'; error: string };

export type RecognitionLogLine = LoggedRecognition & {
  at: number;
  endToEndMs: number;
  phaseMs?: ScanPhases;
  photoSize?: { width: number; height: number };
};

function scanPhases(
  { photoRequestedAt, photo: { times: photo }, recognizeCalledAt, recognizer }: ScanTimes,
  at: number,
): ScanPhases {
  return {
    photoRequest: photo.receivedAt - photoRequestedAt,
    photoCapture: photo.capturedAt - photo.receivedAt,
    photoProcessing: photo.processedAt - photo.capturedAt,
    photoSave: photo.savedAt - photo.processedAt,
    photoHandOff: recognizeCalledAt - photo.savedAt,
    recognizerCall: recognizer.startedAt - recognizeCalledAt,
    recognizer: recognizer.endedAt - recognizer.startedAt,
    recognitionHandOff: at - recognizer.endedAt,
  };
}

export function logRecognition(photoRequestedAt: number, recognition: LoggedRecognition) {
  const at = Date.now();
  const line: RecognitionLogLine = { ...recognition, at, endToEndMs: at - photoRequestedAt };
  logForDevelopment('recognition', line);
}

export function logTimedRecognition(times: ScanTimes, recognition: Recognition) {
  const at = Date.now();
  const line: RecognitionLogLine = {
    ...recognition,
    at,
    endToEndMs: at - times.photoRequestedAt,
    phaseMs: scanPhases(times, at),
    photoSize: { width: times.photo.width, height: times.photo.height },
  };
  logForDevelopment('recognition', line);
}

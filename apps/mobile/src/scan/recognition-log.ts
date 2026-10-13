import { logForDevelopment } from '@/lib/development-log';

import type { Recognition } from '../../modules/card-recognizer';

export type LoggedRecognition = Recognition | { kind: 'failed'; error: string };

export type RecognitionLogLine = LoggedRecognition & { at: number; endToEndMs: number };

export function logRecognition(photoRequestedAt: number, recognition: LoggedRecognition) {
  const at = Date.now();
  const line: RecognitionLogLine = { ...recognition, at, endToEndMs: at - photoRequestedAt };
  logForDevelopment('recognition', line);
}

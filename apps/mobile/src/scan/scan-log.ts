import type { Recognition } from '../../modules/card-recognizer';

export const scanLogPrefix = 'SCAN ';

export type ScanOutcome = Recognition | { kind: 'failed'; error: string };

export type ScanLogLine = ScanOutcome & { at: number; endToEndMs: number };

export function logScan(photoRequestedAt: number, outcome: ScanOutcome) {
  if (__DEV__) {
    const at = Date.now();
    const line: ScanLogLine = { ...outcome, at, endToEndMs: at - photoRequestedAt };
    console.info(`${scanLogPrefix}${JSON.stringify(line)}`);
  }
}

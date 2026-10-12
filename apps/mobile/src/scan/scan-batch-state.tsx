import { randomUUID } from 'expo-crypto';
import { createContext, use, useCallback, useMemo, useReducer, useState, type Dispatch, type ReactNode } from 'react';

import { useSession } from '@/auth/session';

import type { Recognition } from '../../modules/card-recognizer';
import { emptyScanBatch, scanBatchReducer, type BatchScan, type Printing, type ScanBatch, type ScanBatchAction } from './scan-batch';

export type ScanOutcome = 'recognized' | 'failed' | 'not_a_card' | 'no_photo';

export type LatestScan =
  | { kind: 'recognizing' }
  | { kind: 'scan'; scan: BatchScan }
  | { kind: 'basic_land'; printing: Printing };

type ScanTab = Readonly<{
  batch: ScanBatch;
  latest: { kind: 'scan'; scanId: string } | { kind: 'basic_land'; printing: Printing } | null;
  recognizing: number;
  sequence: number;
}>;

type ScanTabAction =
  | ScanBatchAction
  | { type: 'signedIn' }
  | { type: 'recognitionStarted' }
  | { type: 'recognitionEnded'; scanId: string; recognition: Recognition | 'failed' | 'no_photo' };

const initialScanTab: ScanTab = { batch: emptyScanBatch, latest: null, recognizing: 0, sequence: 0 };

function recognitionEnded(state: ScanTab, scanId: string, recognition: Recognition | 'failed' | 'no_photo'): ScanTab {
  const ended = { ...state, recognizing: Math.max(0, state.recognizing - 1) };
  if (recognition === 'no_photo' || (recognition !== 'failed' && recognition.kind === 'not_a_card')) {
    return ended;
  }
  const first = recognition === 'failed' ? undefined : recognition.candidates[0];
  if (first?.basicLand) {
    return { ...ended, latest: { kind: 'basic_land', printing: first } };
  }
  const sequence = state.sequence + 1;
  const action: ScanBatchAction =
    recognition === 'failed' || !first
      ? { type: 'failed', scanId, sequence }
      : {
          type: 'recognized',
          scanId,
          sequence,
          candidates: recognition.candidates,
          sameTextTwinCount: recognition.sameTextTwinCount,
          premiumMark: recognition.reading.premiumMark,
        };
  return { ...ended, sequence, latest: { kind: 'scan', scanId }, batch: scanBatchReducer(state.batch, action) };
}

function scanTabReducer(state: ScanTab, action: ScanTabAction): ScanTab {
  switch (action.type) {
    case 'signedIn':
      return initialScanTab;
    case 'recognitionStarted':
      return { ...state, recognizing: state.recognizing + 1 };
    case 'recognitionEnded':
      return recognitionEnded(state, action.scanId, action.recognition);
    default:
      return { ...state, batch: scanBatchReducer(state.batch, action) };
  }
}

export function outcomeOf(recognition: Recognition | 'failed' | 'no_photo'): ScanOutcome {
  if (recognition === 'failed' || recognition === 'no_photo') {
    return recognition;
  }
  if (recognition.kind === 'not_a_card') {
    return 'not_a_card';
  }
  return recognition.candidates.length > 0 ? 'recognized' : 'failed';
}

type ScanBatchState = {
  batch: ScanBatch;
  latest: LatestScan | null;
  dispatch: Dispatch<ScanBatchAction>;
  recognitionStarted: () => void;
  recognitionEnded: (recognition: Recognition | 'failed' | 'no_photo') => void;
};

const ScanBatchContext = createContext<ScanBatchState | null>(null);

function latestScan({ batch, latest, recognizing }: ScanTab): LatestScan | null {
  if (recognizing > 0) {
    return { kind: 'recognizing' };
  }
  if (latest?.kind === 'scan') {
    const scan = batch.scans.find((candidate) => candidate.scanId === latest.scanId);
    return scan ? { kind: 'scan', scan } : null;
  }
  return latest;
}

export function ScanBatchProvider({ children }: { children: ReactNode }) {
  const userId = useSession()?.user.id;
  const [batchUserId, setBatchUserId] = useState(userId);
  const [state, dispatchTab] = useReducer(scanTabReducer, initialScanTab);
  if (batchUserId !== userId) {
    setBatchUserId(userId);
    dispatchTab({ type: 'signedIn' });
  }
  const recognitionStarted = useCallback(() => dispatchTab({ type: 'recognitionStarted' }), []);
  const recognitionEnded = useCallback(
    (recognition: Recognition | 'failed' | 'no_photo') =>
      dispatchTab({ type: 'recognitionEnded', scanId: randomUUID(), recognition }),
    [],
  );

  const value = useMemo<ScanBatchState>(
    () => ({
      batch: state.batch,
      latest: latestScan(state),
      dispatch: dispatchTab,
      recognitionStarted,
      recognitionEnded,
    }),
    [recognitionEnded, recognitionStarted, state],
  );

  return <ScanBatchContext value={value}>{children}</ScanBatchContext>;
}

export function useScanBatch(): ScanBatchState {
  const state = use(ScanBatchContext);
  if (!state) {
    throw new Error('useScanBatch needs a ScanBatchProvider');
  }
  return state;
}

export function useBatchScan(scanId: string | undefined): BatchScan | undefined {
  return useScanBatch().batch.scans.find((scan) => scan.scanId === scanId);
}

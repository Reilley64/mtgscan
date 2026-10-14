import type { Json } from '@mtgscan/supabase/database.types';
import { randomUUID } from 'expo-crypto';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';

import { useSession } from '@/auth/session';
import { supabase } from '@/lib/supabase';

import type { Recognition } from '../../modules/card-recognizer';
import {
  emptyScanBatch,
  scanBatchReducer,
  scansToAdd,
  stacksOf,
  type BatchScan,
  type Printing,
  type ScanBatch,
  type ScanBatchAction,
  type ScanEdit,
} from './scan-batch';
import { readScanBatch, writeScanBatch } from './scan-batch-file';

export type RecognitionResult = Recognition | 'failed' | 'no_photo';

export type ScanOutcome = 'recognized' | 'failed' | 'not_a_card' | 'no_photo';

export type LatestScan =
  | { kind: 'recognizing' }
  | { kind: 'scan'; scan: BatchScan }
  | { kind: 'basic_land'; printing: Printing };

export type CommitStatus = 'idle' | 'adding' | 'failed';

type Scanning = Readonly<{
  restored: boolean;
  batch: ScanBatch;
  latest: Exclude<LatestScan, { kind: 'recognizing' | 'scan' }> | { kind: 'scan'; scanId: string } | null;
  recognizing: number;
  commitStatus: CommitStatus;
}>;

type ScanningAction =
  | ScanBatchAction
  | { type: 'accountChanged' }
  | { type: 'restored'; batch: ScanBatch }
  | { type: 'recognitionStarted' }
  | { type: 'recognitionEnded'; scanId: string; recognition: RecognitionResult }
  | { type: 'commitFailed' }
  | { type: 'commitSucceeded'; scanIds: string[] }
  | { type: 'removedAll' };

const initialScanning: Scanning = {
  restored: false,
  batch: emptyScanBatch,
  latest: null,
  recognizing: 0,
  commitStatus: 'idle',
};

function recognitionEnded(state: Scanning, scanId: string, recognition: RecognitionResult): Scanning {
  const ended = { ...state, recognizing: Math.max(0, state.recognizing - 1) };
  if (recognition === 'no_photo' || (recognition !== 'failed' && recognition.kind === 'not_a_card')) {
    return ended;
  }
  const first = recognition === 'failed' ? undefined : recognition.candidates[0];
  if (first?.basicLand) {
    return { ...ended, latest: { kind: 'basic_land', printing: first } };
  }
  const action: ScanBatchAction =
    recognition === 'failed' || !first
      ? { type: 'failed', scanId }
      : {
          type: 'recognized',
          scanId,
          candidates: recognition.candidates,
          sameTextTwinCount: recognition.sameTextTwinCount,
          premiumMark: recognition.reading.premiumMark,
        };
  return { ...ended, latest: { kind: 'scan', scanId }, batch: scanBatchReducer(state.batch, action) };
}

function scanningReducer(state: Scanning, action: ScanningAction): Scanning {
  switch (action.type) {
    case 'accountChanged':
      return initialScanning;
    case 'restored':
      return {
        ...state,
        restored: true,
        batch: { ...action.batch, scans: [...action.batch.scans, ...state.batch.scans] },
      };
    case 'recognitionStarted':
      return { ...state, recognizing: state.recognizing + 1 };
    case 'recognitionEnded':
      return recognitionEnded(state, action.scanId, action.recognition);
    case 'addCopy':
      return {
        ...state,
        batch: scanBatchReducer(state.batch, action),
        latest: { kind: 'scan', scanId: action.newScanId },
      };
    case 'commitStarted':
      return { ...state, batch: scanBatchReducer(state.batch, action), commitStatus: 'adding' };
    case 'commitFailed':
      return { ...state, commitStatus: 'failed' };
    case 'commitSucceeded':
      return {
        ...state,
        batch: scanBatchReducer(state.batch, { type: 'committed', scanIds: action.scanIds }),
        latest: null,
        commitStatus: 'idle',
      };
    case 'removedAll':
      return { ...state, batch: emptyScanBatch, latest: null, commitStatus: 'idle' };
    default:
      return { ...state, batch: scanBatchReducer(state.batch, action) };
  }
}

export function outcomeOf(recognition: RecognitionResult): ScanOutcome {
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
  commitStatus: CommitStatus;
  dispatch: Dispatch<ScanEdit>;
  addCopy: (scanId: string) => void;
  removeAll: () => void;
  commit: () => Promise<boolean>;
  recognitionStarted: () => void;
  recognitionEnded: (recognition: RecognitionResult) => void;
};

const ScanBatchContext = createContext<ScanBatchState | null>(null);

function latestScan({ batch, latest, recognizing }: Scanning): LatestScan | null {
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
  const [state, dispatchScanning] = useReducer(scanningReducer, initialScanning);
  if (batchUserId !== userId) {
    setBatchUserId(userId);
    dispatchScanning({ type: 'accountChanged' });
  }

  const commitBatch = useCallback(async (batch: ScanBatch) => {
    const scans = scansToAdd(batch);
    dispatchScanning({ type: 'commitStarted' });
    const { error } = await supabase.rpc('add_scan_batch', {
      batch: { items: stacksOf(scans) } as unknown as Json,
    });
    if (error) {
      dispatchScanning({ type: 'commitFailed' });
      return false;
    }
    dispatchScanning({ type: 'commitSucceeded', scanIds: scans.map((scan) => scan.scanId) });
    return true;
  }, []);

  useEffect(() => {
    if (!userId) {
      return;
    }
    let current = true;
    readScanBatch(userId).then((batch) => {
      if (!current) {
        return;
      }
      dispatchScanning({ type: 'restored', batch });
      if (batch.commitPending) {
        void commitBatch(batch);
      }
    });
    return () => {
      current = false;
    };
  }, [commitBatch, userId]);

  useEffect(() => {
    if (userId && state.restored) {
      writeScanBatch(userId, state.batch);
    }
  }, [state.batch, state.restored, userId]);

  const recognitionStarted = useCallback(() => dispatchScanning({ type: 'recognitionStarted' }), []);
  const recognitionEnded = useCallback(
    (recognition: RecognitionResult) =>
      dispatchScanning({ type: 'recognitionEnded', scanId: randomUUID(), recognition }),
    [],
  );
  const addCopy = useCallback(
    (scanId: string) => dispatchScanning({ type: 'addCopy', scanId, newScanId: randomUUID() }),
    [],
  );

  const removeAll = useCallback(() => dispatchScanning({ type: 'removedAll' }), []);

  const commit = useCallback(() => commitBatch(state.batch), [commitBatch, state.batch]);

  const value = useMemo<ScanBatchState>(
    () => ({
      batch: state.batch,
      latest: latestScan(state),
      commitStatus: state.commitStatus,
      dispatch: dispatchScanning,
      addCopy,
      removeAll,
      commit,
      recognitionStarted,
      recognitionEnded,
    }),
    [addCopy, commit, recognitionEnded, recognitionStarted, removeAll, state],
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

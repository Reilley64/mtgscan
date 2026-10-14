import type { Json } from '@mtgscan/supabase/database.types';
import { randomUUID } from 'expo-crypto';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
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
  stacksOf,
  type BatchScan,
  type Printing,
  type ScanBatch,
  type ScanBatchAction,
  type ScanEdit,
} from './scan-batch';
import { readScanBatch, writeScanBatch } from './scan-batch-file';
import { playScanFeedback } from './scan-feedback';
import { useScanSounds } from './scan-sounds-setting';

export type RecognitionResult = Recognition | 'failed' | 'no_photo';

export type ScanOutcome = 'recognized' | 'failed' | 'not_a_card' | 'no_photo';

export type LatestScan =
  | { kind: 'recognizing' }
  | { kind: 'scan'; scan: BatchScan }
  | { kind: 'not_recognized'; scanId: string }
  | { kind: 'basic_land'; printing: Printing };

export type CommitStatus = 'idle' | 'adding' | 'failed';

type Scanning = Readonly<{
  restored: boolean;
  batch: ScanBatch;
  latest: Exclude<LatestScan, { kind: 'recognizing' | 'scan' }> | { kind: 'scan'; scanId: string } | null;
  recognizing: readonly string[];
  feedback: { outcome: ScanOutcome } | null;
  commitStatus: CommitStatus;
}>;

type ScanningAction =
  | ScanBatchAction
  | { type: 'accountChanged' }
  | { type: 'restored'; batch: ScanBatch }
  | { type: 'recognitionStarted'; photoId: string }
  | { type: 'recognitionEnded'; photoId: string; scanId: string; recognition: RecognitionResult }
  | { type: 'commitFailed' }
  | { type: 'commitSucceeded'; scanIds: string[] }
  | { type: 'removedAll' };

const initialScanning: Scanning = {
  restored: false,
  batch: emptyScanBatch,
  latest: null,
  recognizing: [],
  feedback: null,
  commitStatus: 'idle',
};

function recognitionEnded(
  state: Scanning,
  { photoId, scanId, recognition }: Extract<ScanningAction, { type: 'recognitionEnded' }>,
): Scanning {
  if (!state.recognizing.includes(photoId)) {
    return state;
  }
  const ended: Scanning = {
    ...state,
    recognizing: state.recognizing.filter((id) => id !== photoId),
    feedback: { outcome: outcomeOf(recognition) },
  };
  if (recognition === 'no_photo' || (recognition !== 'failed' && recognition.kind === 'not_a_card')) {
    return ended;
  }
  const first = recognition === 'failed' ? undefined : recognition.candidates[0];
  if (recognition === 'failed' || !first) {
    return { ...ended, latest: { kind: 'not_recognized', scanId } };
  }
  if (first.basicLand) {
    return { ...ended, latest: { kind: 'basic_land', printing: first } };
  }
  return addScan(ended, {
    type: 'recognized',
    scanId,
    printing: first,
    options: recognition.candidates,
    sameTextTwinCount: recognition.sameTextTwinCount,
    premiumMark: recognition.reading.premiumMark,
  });
}

function addScan(state: Scanning, action: Extract<ScanBatchAction, { type: 'recognized' }>): Scanning {
  return { ...state, latest: { kind: 'scan', scanId: action.scanId }, batch: scanBatchReducer(state.batch, action) };
}

function notRecognizedScanIdOf({ latest }: Scanning) {
  return latest?.kind === 'not_recognized' ? latest.scanId : null;
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
      return { ...state, recognizing: [...state.recognizing, action.photoId] };
    case 'recognitionEnded':
      return recognitionEnded(state, action);
    case 'choose':
      return notRecognizedScanIdOf(state) === action.scanId
        ? addScan(state, { ...action, type: 'recognized', options: [], sameTextTwinCount: 0, premiumMark: false })
        : { ...state, batch: scanBatchReducer(state.batch, action) };
    case 'remove':
      return notRecognizedScanIdOf(state) === action.scanId
        ? { ...state, latest: null }
        : { ...state, batch: scanBatchReducer(state.batch, action) };
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
        latest: notRecognizedScanIdOf(state) ? state.latest : null,
        commitStatus: 'idle',
      };
    case 'removedAll':
      return { ...initialScanning, restored: state.restored };
    default:
      return { ...state, batch: scanBatchReducer(state.batch, action) };
  }
}

function outcomeOf(recognition: RecognitionResult): ScanOutcome {
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
  notRecognizedScanId: string | null;
  commitStatus: CommitStatus;
  dispatch: Dispatch<ScanEdit>;
  addCopy: (scanId: string) => void;
  removeAll: () => void;
  commit: () => Promise<boolean>;
  recognitionStarted: () => string;
  recognitionEnded: (photoId: string, recognition: RecognitionResult) => void;
};

const ScanBatchContext = createContext<ScanBatchState | null>(null);

function latestScan({ batch, latest, recognizing }: Scanning): LatestScan | null {
  if (recognizing.length > 0) {
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
  const { scanSounds } = useScanSounds();
  if (batchUserId !== userId) {
    setBatchUserId(userId);
    dispatchScanning({ type: 'accountChanged' });
  }

  const playFeedback = useEffectEvent((outcome: ScanOutcome) => playScanFeedback(outcome, scanSounds));
  useEffect(() => {
    if (state.feedback) {
      playFeedback(state.feedback.outcome);
    }
  }, [state.feedback]);

  const commitBatch = useCallback(async (batch: ScanBatch) => {
    const { scans } = batch;
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

  const recognitionStarted = useCallback(() => {
    const photoId = randomUUID();
    dispatchScanning({ type: 'recognitionStarted', photoId });
    return photoId;
  }, []);
  const recognitionEnded = useCallback(
    (photoId: string, recognition: RecognitionResult) =>
      dispatchScanning({ type: 'recognitionEnded', photoId, scanId: randomUUID(), recognition }),
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
      notRecognizedScanId: notRecognizedScanIdOf(state),
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

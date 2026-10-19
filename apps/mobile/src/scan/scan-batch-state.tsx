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
import { useGallery } from '@/gallery/gallery-state';
import { supabase } from '@/lib/supabase';

import {
  featurePrintRevision,
  recognizerVersion,
  type CardRecognition,
  type Recognition,
} from '../../modules/card-recognizer';
import {
  emptyScanBatch,
  scanBatchReducer,
  stacksOf,
  type BatchScan,
  type Printing,
  type ScanBatch,
  type ScanBatchAction,
  type ScanEdit,
  type ScanTrainingCrop,
} from './scan-batch';
import { readScanBatch, writeScanBatch } from './scan-batch-file';
import { playScanFeedback } from './scan-feedback';
import { useScanSounds } from './scan-sounds-setting';
import {
  dropTrainingCrop,
  dropTrainingCropsOf,
  keepTrainingCrop,
  queueTrainingCrops,
  useTrainingCropUploads,
} from './training-crops';

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
  | {
      type: 'recognitionEnded';
      photoId: string;
      scanId: string;
      recognition: RecognitionResult;
      trainingCrop: ScanTrainingCrop | null;
    }
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

function scannedCard(recognition: RecognitionResult): CardRecognition | null {
  if (recognition === 'failed' || recognition === 'no_photo' || recognition.kind !== 'card') {
    return null;
  }
  const first = recognition.candidates[0];
  return first && !first.basicLand ? recognition : null;
}

function recognitionEnded(
  state: Scanning,
  { photoId, scanId, recognition, trainingCrop }: Extract<ScanningAction, { type: 'recognitionEnded' }>,
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
  const card = scannedCard(recognition);
  if (card) {
    return addScan(ended, {
      type: 'recognized',
      scanId,
      printing: card.candidates[0]!,
      options: card.candidates,
      sameTextTwinCount: card.sameTextTwinCount,
      premiumMark: card.reading.premiumMark,
      recognizedPrintingId: card.candidates[0]!.printingId,
      trainingCrop,
    });
  }
  const first = recognition === 'failed' ? undefined : recognition.candidates[0];
  return first?.basicLand
    ? { ...ended, latest: { kind: 'basic_land', printing: first } }
    : { ...ended, latest: { kind: 'not_recognized', scanId } };
}

function keptTrainingCrop(
  recognition: RecognitionResult,
  scanId: string,
  userId: string | undefined,
  galleryVersion: string | undefined,
): ScanTrainingCrop | null {
  const cropUri =
    recognition !== 'failed' && recognition !== 'no_photo' && recognition.kind === 'card' ? recognition.trainingCrop : null;
  if (!cropUri) {
    return null;
  }
  const card = scannedCard(recognition);
  const uri = card && userId && galleryVersion ? keepTrainingCrop(cropUri, userId, scanId) : null;
  if (!card || !galleryVersion || !uri) {
    dropTrainingCrop(cropUri);
    return null;
  }
  return {
    uri,
    accepted: card.decision.accepted,
    decisionBasis: card.decision.basis,
    decisionReasons: card.decision.reasons,
    topSimilarity: card.topSimilarity,
    artMargin: card.artMargin,
    reading: card.reading,
    recognizerVersion,
    featurePrintRevision,
    galleryVersion,
  };
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
        ? addScan(state, {
            type: 'recognized',
            scanId: action.scanId,
            printing: action.printing,
            options: [],
            sameTextTwinCount: 0,
            premiumMark: false,
            recognizedPrintingId: null,
            trainingCrop: null,
          })
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
  const galleryVersion = useGallery().installed?.version;
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

  useTrainingCropUploads(userId);

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
    if (userId) {
      void queueTrainingCrops(userId, scans);
    }
    return true;
  }, [userId]);

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
    (photoId: string, recognition: RecognitionResult) => {
      const scanId = randomUUID();
      const trainingCrop = keptTrainingCrop(recognition, scanId, userId, galleryVersion);
      dispatchScanning({ type: 'recognitionEnded', photoId, scanId, recognition, trainingCrop });
    },
    [galleryVersion, userId],
  );
  const addCopy = useCallback(
    (scanId: string) => dispatchScanning({ type: 'addCopy', scanId, newScanId: randomUUID() }),
    [],
  );

  const dispatch = useCallback(
    (edit: ScanEdit) => {
      if (edit.type === 'remove') {
        dropTrainingCropsOf(state.batch.scans.filter((scan) => scan.scanId === edit.scanId));
      }
      dispatchScanning(edit);
    },
    [state.batch.scans],
  );

  const removeAll = useCallback(() => {
    dropTrainingCropsOf(state.batch.scans);
    dispatchScanning({ type: 'removedAll' });
  }, [state.batch.scans]);

  const commit = useCallback(() => commitBatch(state.batch), [commitBatch, state.batch]);

  const value = useMemo<ScanBatchState>(
    () => ({
      batch: state.batch,
      latest: latestScan(state),
      notRecognizedScanId: notRecognizedScanIdOf(state),
      commitStatus: state.commitStatus,
      dispatch,
      addCopy,
      removeAll,
      commit,
      recognitionStarted,
      recognitionEnded,
    }),
    [addCopy, commit, dispatch, recognitionEnded, recognitionStarted, removeAll, state],
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

import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import { randomUUID } from 'expo-crypto';
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from 'react';

import { useSession } from '@/auth/session';
import { useGallery } from '@/gallery/gallery-state';
import { supabase } from '@/lib/supabase';

import {
  recognizerVersion,
  type CardRecognition,
  type InstalledGallery,
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
import { useTrainingCropUploadsSetting } from './training-crop-uploads-setting';
import { trainingCropKeeper, type TrainingCropKeeper } from './training-crop-keeper';

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
  strayTrainingCrops: readonly StrayTrainingCrop[];
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
      keptCrop: KeptTrainingCrop | null;
    }
  | { type: 'commitFailed' }
  | { type: 'commitSucceeded'; scanIds: string[] }
  | { type: 'removedAll' }
  | { type: 'strayTrainingCropsDropped'; crops: readonly StrayTrainingCrop[] };

type KeptTrainingCrop = { userId: string; trainingCrop: ScanTrainingCrop };

type StrayTrainingCrop = { userId: string; copyId: string };

const initialScanning: Scanning = {
  restored: false,
  batch: emptyScanBatch,
  latest: null,
  recognizing: [],
  feedback: null,
  commitStatus: 'idle',
  strayTrainingCrops: [],
};

function cardRecognitionOf(recognition: RecognitionResult): CardRecognition | null {
  return recognition !== 'failed' && recognition !== 'no_photo' && recognition.kind === 'card' ? recognition : null;
}

function scannedCard(recognition: RecognitionResult): CardRecognition | null {
  const card = cardRecognitionOf(recognition);
  const first = card?.candidates[0];
  return first && !first.basicLand ? card : null;
}

function recognitionEnded(
  state: Scanning,
  { photoId, scanId, recognition, keptCrop }: Extract<ScanningAction, { type: 'recognitionEnded' }>,
): Scanning {
  if (!state.recognizing.includes(photoId)) {
    return keptCrop
      ? { ...state, strayTrainingCrops: [...state.strayTrainingCrops, { userId: keptCrop.userId, copyId: scanId }] }
      : state;
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
      trainingCrop: keptCrop?.trainingCrop ?? null,
    });
  }
  const first = cardRecognitionOf(recognition)?.candidates[0];
  return first?.basicLand
    ? { ...ended, latest: { kind: 'basic_land', printing: first } }
    : { ...ended, latest: { kind: 'not_recognized', scanId } };
}

function keptTrainingCrop(
  recognition: RecognitionResult,
  scanId: string,
  keeper: TrainingCropKeeper | null,
  gallery: InstalledGallery | null | undefined,
): KeptTrainingCrop | null {
  const cropUri = cardRecognitionOf(recognition)?.trainingCrop;
  if (!cropUri || !keeper) {
    return null;
  }
  const card = scannedCard(recognition);
  if (card && gallery && keeper.keep(cropUri, scanId)) {
    return {
      userId: keeper.userId,
      trainingCrop: {
        decision: card.decision,
        topSimilarity: card.topSimilarity,
        artMargin: card.artMargin,
        reading: card.reading,
        recognizerVersion,
        featurePrintModel: gallery.model,
        galleryVersion: gallery.version,
      },
    };
  }
  keeper.discard(cropUri);
  return null;
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
      return { ...initialScanning, strayTrainingCrops: state.strayTrainingCrops };
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
        feedback: { outcome: 'recognized' },
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
      return { ...initialScanning, restored: state.restored, strayTrainingCrops: state.strayTrainingCrops };
    case 'strayTrainingCropsDropped':
      return { ...state, strayTrainingCrops: state.strayTrainingCrops.filter((crop) => !action.crops.includes(crop)) };
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
  const gallery = useGallery().installed;
  const [batchUserId, setBatchUserId] = useState(userId);
  const [state, dispatchScanning] = useReducer(scanningReducer, initialScanning);
  const keeper = useMemo(() => (userId ? trainingCropKeeper(userId) : null), [userId]);
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

  useEffect(() => {
    if (state.strayTrainingCrops.length > 0) {
      state.strayTrainingCrops.forEach(({ userId, copyId }) => trainingCropKeeper(userId).drop([copyId]));
      dispatchScanning({ type: 'strayTrainingCropsDropped', crops: state.strayTrainingCrops });
    }
  }, [state.strayTrainingCrops]);

  const { uploadsOn } = useTrainingCropUploadsSetting();
  const trainingCropUploadsOn = useRef(uploadsOn);
  useEffect(() => {
    trainingCropUploadsOn.current = uploadsOn;
  }, [uploadsOn]);

  const commitBatch = useCallback(async (batch: ScanBatch) => {
    const { scans } = batch;
    dispatchScanning({ type: 'commitStarted' });
    const result = await callDatabaseFunction(supabase, databaseFunctions.add_scan_batch, { items: stacksOf(scans) });
    if (result.status !== 'replied') {
      dispatchScanning({ type: 'commitFailed' });
      return false;
    }
    keeper?.scanBatchCommitted(scans, trainingCropUploadsOn.current);
    dispatchScanning({ type: 'commitSucceeded', scanIds: scans.map((scan) => scan.scanId) });
    return true;
  }, [keeper]);

  useEffect(() => {
    if (!userId || !keeper) {
      return;
    }
    let current = true;
    readScanBatch(userId).then((batch) => {
      if (!current) {
        return;
      }
      void keeper.scanBatchRestored(batch);
      dispatchScanning({ type: 'restored', batch });
      if (batch.commitPending) {
        void commitBatch(batch);
      }
    });
    return () => {
      current = false;
    };
  }, [commitBatch, keeper, userId]);

  useEffect(() => {
    if (userId && keeper && state.restored) {
      writeScanBatch(userId, state.batch);
      keeper.dropCropsOfScansThatLeft(state.batch);
    }
  }, [keeper, state.batch, state.restored, userId]);

  const recognitionStarted = useCallback(() => {
    const photoId = randomUUID();
    dispatchScanning({ type: 'recognitionStarted', photoId });
    return photoId;
  }, []);
  const recognitionEnded = useCallback(
    (photoId: string, recognition: RecognitionResult) => {
      const scanId = randomUUID();
      const keptCrop = keptTrainingCrop(recognition, scanId, keeper, gallery);
      dispatchScanning({ type: 'recognitionEnded', photoId, scanId, recognition, keptCrop });
    },
    [gallery, keeper],
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

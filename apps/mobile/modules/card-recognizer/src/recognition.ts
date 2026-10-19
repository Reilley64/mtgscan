import type { Finish } from '@mtgscan/supabase/search';

export type NormalizedPhotoPoint = { x: number; y: number };

export type CardOutline = [
  topLeft: NormalizedPhotoPoint,
  topRight: NormalizedPhotoPoint,
  bottomRight: NormalizedPhotoPoint,
  bottomLeft: NormalizedPhotoPoint,
];

export type RecognitionErrorCode = 'gallery_not_ready' | 'unreadable_photo' | 'rectification_failed';

export type GalleryCardPrinting = {
  printingId: string;
  oracleId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
  finishes: Finish[];
  basicLand: boolean;
};

export type CardName = {
  oracleId: string;
  name: string;
};

export type CollectorLineReading = {
  setCode?: string;
  collectorNumber?: string;
  premiumMark: boolean;
};

export type StageTimes = Partial<Record<'rectify' | 'resize' | 'embed' | 'search' | 'read', number>>;

export type DecisionBasis = 'collector_line' | 'set_code' | 'unique_art';

export type RecognitionDecision =
  | { accepted: true; basis: DecisionBasis; reasons: string[] }
  | { accepted: false; basis: null; reasons: string[] };

export type CardRecognition = {
  kind: 'card';
  candidates: GalleryCardPrinting[];
  decision: RecognitionDecision;
  reading: CollectorLineReading;
  sameTextTwinCount: number;
  topSimilarity: number;
  artMargin: number | null;
  rotation: 0 | 180;
  trainingCrop: string | null;
  stageMs: StageTimes;
};

export type NotACardRecognition = {
  kind: 'not_a_card';
  topSimilarity: number;
  stageMs: StageTimes;
};

export type Recognition = CardRecognition | NotACardRecognition;

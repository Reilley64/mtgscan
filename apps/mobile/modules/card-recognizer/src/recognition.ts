export type NormalizedPhotoPoint = { x: number; y: number };

export type CardOutline = [
  topLeft: NormalizedPhotoPoint,
  topRight: NormalizedPhotoPoint,
  bottomRight: NormalizedPhotoPoint,
  bottomLeft: NormalizedPhotoPoint,
];

export type RecognitionErrorCode = 'gallery_not_ready' | 'unreadable_photo' | 'rectification_failed';

export type RecognitionCandidate = {
  printingId: string;
  oracleId: string;
  name: string;
  setCode: string;
  collectorNumber: string;
};

export type CollectorLineReading = {
  setCode?: string;
  collectorNumber?: string;
  premiumMark: boolean;
};

export type StageTimes = Partial<Record<'rectify' | 'resize' | 'embed' | 'search' | 'read', number>>;

export type CardRecognition = {
  kind: 'card';
  candidates: RecognitionCandidate[];
  decision: { accepted: boolean; reasons: string[] };
  reading: CollectorLineReading;
  sameTextTwinCount: number;
  topSimilarity: number;
  rotation: 0 | 180;
  stageMs: StageTimes;
};

export type NotACardRecognition = {
  kind: 'not_a_card';
  topSimilarity: number;
  stageMs: StageTimes;
};

export type Recognition = CardRecognition | NotACardRecognition;

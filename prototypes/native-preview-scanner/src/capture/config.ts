export const CARD_ASPECT_RATIO = 63 / 88;
export const GUIDE_WIDTH_FRACTION = 0.72;
export const ANALYSIS_MARGIN_FRACTION = 0.08;
export const ANALYSIS_SHORT_EDGE = 48;

export type CaptureThresholds = {
  borderEnergyMin: number;
  borderContinuityMin: number;
  centerScoreMin: number;
  interiorVarianceMin: number;
  sharpnessMin: number;
  motionMax: number;
  departureBorderContinuityMax: number;
  departureVarianceMax: number;
  dwellMs: number;
  departureMs: number;
};

// These values are trial settings. Tune them only from physical telemetry.
export const DEFAULT_CAPTURE_THRESHOLDS: CaptureThresholds = {
  borderEnergyMin: 28,
  borderContinuityMin: 0.52,
  centerScoreMin: 0.58,
  interiorVarianceMin: 220,
  sharpnessMin: 12,
  motionMax: 8,
  departureBorderContinuityMax: 0.18,
  departureVarianceMax: 120,
  dwellMs: 400,
  departureMs: 400,
};

export const AUTOMATIC_CAPTURE_ENABLED = false;

export type DetectorThresholds = {
  confidenceMin: number;
  areaRatioMin: number;
  areaRatioMax: number;
  aspectRatioMin: number;
  aspectRatioMax: number;
  centerOffsetMax: number;
};

export const DETECTOR_THRESHOLDS: DetectorThresholds = {
  confidenceMin: 0.5,
  areaRatioMin: 0.08,
  areaRatioMax: 0.7,
  aspectRatioMin: 0.55,
  aspectRatioMax: 0.9,
  centerOffsetMax: 0.35,
};

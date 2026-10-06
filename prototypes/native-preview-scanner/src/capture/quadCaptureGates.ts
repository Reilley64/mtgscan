import type { PreviewGates } from "./metrics";
import type {
  DetectorPoint,
  NativeRectangleRecord,
} from "../detector/validation";

export type QuadCaptureThresholds = {
  stableMotionMax: number;
  changeCorrelationMax: number;
  cardEvidenceConfidenceMin: number;
  cardEvidenceAreaMax: number;
};

export const QUAD_CAPTURE_THRESHOLDS: QuadCaptureThresholds = {
  stableMotionMax: 0.04,
  changeCorrelationMax: 0.8,
  cardEvidenceConfidenceMin: 0.6,
  cardEvidenceAreaMax: 0.6,
};

export type QuadCorners = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const pointsOf = (
  topLeft: DetectorPoint | null,
  topRight: DetectorPoint | null,
  bottomRight: DetectorPoint | null,
  bottomLeft: DetectorPoint | null,
  width: number,
  height: number,
): QuadCorners | null => {
  "worklet";
  if (
    topLeft === null ||
    topRight === null ||
    bottomRight === null ||
    bottomLeft === null
  )
    return null;
  return [
    topLeft.x * width,
    topLeft.y * height,
    topRight.x * width,
    topRight.y * height,
    bottomRight.x * width,
    bottomRight.y * height,
    bottomLeft.x * width,
    bottomLeft.y * height,
  ];
};

export function refinedCorners(
  observation: NativeRectangleRecord,
  width: number,
  height: number,
): QuadCorners | null {
  "worklet";
  if (!observation.detected) return null;
  return pointsOf(
    observation.topLeft,
    observation.topRight,
    observation.bottomRight,
    observation.bottomLeft,
    width,
    height,
  );
}

export function proposalAreaRatio(observation: NativeRectangleRecord): number {
  "worklet";
  const corners = pointsOf(
    observation.proposalTopLeft,
    observation.proposalTopRight,
    observation.proposalBottomRight,
    observation.proposalBottomLeft,
    1,
    1,
  );
  if (corners === null) return 0;
  let twiceArea = 0;
  for (let index = 0; index < 4; index += 1) {
    const next = (index + 1) % 4;
    twiceArea +=
      corners[index * 2]! * corners[next * 2 + 1]! -
      corners[next * 2]! * corners[index * 2 + 1]!;
  }
  return Math.abs(twiceArea) / 2;
}

export function quadMotion(
  previous: QuadCorners | null,
  current: QuadCorners | null,
): number | null {
  "worklet";
  if (previous === null || current === null) return null;
  const side = (corners: QuadCorners, first: number, second: number) =>
    Math.hypot(
      corners[second * 2]! - corners[first * 2]!,
      corners[second * 2 + 1]! - corners[first * 2 + 1]!,
    );
  const shortSide = Math.min(
    (side(current, 0, 1) + side(current, 3, 2)) / 2,
    (side(current, 0, 3) + side(current, 1, 2)) / 2,
  );
  if (!(shortSide > 0)) return null;
  let largest = 0;
  for (let index = 0; index < 4; index += 1) {
    largest = Math.max(
      largest,
      Math.hypot(
        current[index * 2]! - previous[index * 2]!,
        current[index * 2 + 1]! - previous[index * 2 + 1]!,
      ),
    );
  }
  return largest / shortSide;
}

export function signatureCorrelation(
  first: readonly number[] | null,
  second: readonly number[] | null,
): number | null {
  "worklet";
  if (first === null || second === null) return null;
  if (first.length === 0 || first.length !== second.length) return null;
  let firstMean = 0;
  let secondMean = 0;
  for (let index = 0; index < first.length; index += 1) {
    firstMean += first[index]!;
    secondMean += second[index]!;
  }
  firstMean /= first.length;
  secondMean /= second.length;
  let product = 0;
  let firstSquares = 0;
  let secondSquares = 0;
  for (let index = 0; index < first.length; index += 1) {
    const a = first[index]! - firstMean;
    const b = second[index]! - secondMean;
    product += a * b;
    firstSquares += a * a;
    secondSquares += b * b;
  }
  const scale = Math.sqrt(firstSquares * secondSquares);
  return scale > 0 ? product / scale : null;
}

export function evaluateQuadCaptureGates(
  observation: NativeRectangleRecord,
  detectorGatesPass: boolean,
  motion: number | null,
  changeCorrelation: number | null = null,
  thresholds: QuadCaptureThresholds = QUAD_CAPTURE_THRESHOLDS,
): PreviewGates {
  "worklet";
  const present = detectorGatesPass;
  const stable = motion !== null && motion <= thresholds.stableMotionMax;
  const cardEvidence =
    present ||
    (observation.proposalDetected &&
      observation.confidence >= thresholds.cardEvidenceConfidenceMin &&
      proposalAreaRatio(observation) <= thresholds.cardEvidenceAreaMax);
  const changed =
    present &&
    changeCorrelation !== null &&
    changeCorrelation < thresholds.changeCorrelationMax;
  return {
    present,
    centered: present,
    sharp: present,
    stable,
    departed: !cardEvidence || changed,
    all: present && stable,
  };
}

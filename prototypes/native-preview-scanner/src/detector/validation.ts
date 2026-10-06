export type DetectorPoint = Readonly<{ x: number; y: number }>;

export type NativeRectangleRecord = Readonly<{
  detected: boolean;
  topLeft: DetectorPoint | null;
  topRight: DetectorPoint | null;
  bottomRight: DetectorPoint | null;
  bottomLeft: DetectorPoint | null;
  proposalDetected: boolean;
  proposalTopLeft: DetectorPoint | null;
  proposalTopRight: DetectorPoint | null;
  proposalBottomRight: DetectorPoint | null;
  proposalBottomLeft: DetectorPoint | null;
  confidence: number;
  areaRatio: number;
  aspectRatio: number;
  centerOffset: number;
  edgeSupportMin: number;
  shiftTop: number;
  shiftRight: number;
  shiftBottom: number;
  shiftLeft: number;
  refinementStatus: number;
  signature: readonly number[];
  edgeSupports: readonly number[];
  fallbackEdges: number;
  proposalDurationMs: number;
  nativeDurationMs: number;
  orientationCode: number;
  runtimeErrorCode: number;
}>;

export const SIGNATURE_LENGTH = 48;

export const REFINEMENT_STATUS_LABELS = [
  "refined",
  "no proposal",
  "proposal outside frame",
  "weak edge",
  "invalid quad",
] as const;

const NATIVE_KEYS = [
  "detected",
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
  "proposalDetected",
  "proposalTopLeft",
  "proposalTopRight",
  "proposalBottomRight",
  "proposalBottomLeft",
  "confidence",
  "areaRatio",
  "aspectRatio",
  "centerOffset",
  "edgeSupportMin",
  "shiftTop",
  "shiftRight",
  "shiftBottom",
  "shiftLeft",
  "refinementStatus",
  "signature",
  "edgeSupports",
  "fallbackEdges",
  "proposalDurationMs",
  "nativeDurationMs",
  "orientationCode",
  "runtimeErrorCode",
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  "worklet";
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isFiniteInRange = (
  value: unknown,
  minimum: number,
  maximum: number,
): value is number => {
  "worklet";
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
};

const normalizedUnit = (value: number) => {
  "worklet";
  if (Object.is(value, -0)) return 0;
  return Math.max(0, Math.min(1, value));
};

const isAbsent = (value: unknown) => {
  "worklet";
  return value === null || value === undefined;
};

const validatePoint = (value: unknown): DetectorPoint | null => {
  "worklet";
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !("x" in value) || !("y" in value)) return null;
  if (!isFiniteInRange(value.x, -0.000_001, 1.000_001)) return null;
  if (!isFiniteInRange(value.y, -0.000_001, 1.000_001)) return null;
  return { x: normalizedUnit(value.x), y: normalizedUnit(value.y) };
};

type Quad = readonly [
  DetectorPoint | null,
  DetectorPoint | null,
  DetectorPoint | null,
  DetectorPoint | null,
];

const validateQuad = (
  present: boolean,
  values: readonly [unknown, unknown, unknown, unknown],
): Quad | null => {
  "worklet";
  const points: Quad = [
    validatePoint(values[0]),
    validatePoint(values[1]),
    validatePoint(values[2]),
    validatePoint(values[3]),
  ];
  if (present) {
    if (
      points[0] === null ||
      points[1] === null ||
      points[2] === null ||
      points[3] === null
    )
      return null;
    return points;
  }
  if (
    !isAbsent(values[0]) ||
    !isAbsent(values[1]) ||
    !isAbsent(values[2]) ||
    !isAbsent(values[3])
  )
    return null;
  return [null, null, null, null];
};

export function validateNativeRectangleRecord(
  value: unknown,
): NativeRectangleRecord | null {
  "worklet";
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== NATIVE_KEYS.length) return null;
  for (const key of NATIVE_KEYS) if (!(key in value)) return null;
  if (typeof value.detected !== "boolean") return null;
  if (typeof value.proposalDetected !== "boolean") return null;
  if (!Number.isInteger(value.orientationCode)) return null;
  if (!Number.isInteger(value.runtimeErrorCode)) return null;
  if (!Number.isInteger(value.refinementStatus)) return null;
  if (!isFiniteInRange(value.orientationCode, -1, 7)) return null;
  if (!isFiniteInRange(value.runtimeErrorCode, 0, 5)) return null;
  if (!isFiniteInRange(value.refinementStatus, 0, 4)) return null;
  if (!isFiniteInRange(value.confidence, 0, 1)) return null;
  if (!isFiniteInRange(value.areaRatio, 0, 1)) return null;
  if (!isFiniteInRange(value.aspectRatio, 0, 1)) return null;
  if (!isFiniteInRange(value.centerOffset, 0, 1)) return null;
  if (!isFiniteInRange(value.edgeSupportMin, 0, 1)) return null;
  if (!isFiniteInRange(value.shiftTop, -1, 1)) return null;
  if (!isFiniteInRange(value.shiftRight, -1, 1)) return null;
  if (!isFiniteInRange(value.shiftBottom, -1, 1)) return null;
  if (!isFiniteInRange(value.shiftLeft, -1, 1)) return null;
  if (!isFiniteInRange(value.proposalDurationMs, 0, 10_000)) return null;
  if (!isFiniteInRange(value.nativeDurationMs, 0, 10_000)) return null;
  if (value.detected) {
    if (value.runtimeErrorCode !== 0) return null;
    if (value.refinementStatus !== 0) return null;
    if (!value.proposalDetected) return null;
  } else if (value.refinementStatus === 0) {
    return null;
  }

  const refined = validateQuad(value.detected, [
    value.topLeft,
    value.topRight,
    value.bottomRight,
    value.bottomLeft,
  ]);
  const proposal = validateQuad(value.proposalDetected, [
    value.proposalTopLeft,
    value.proposalTopRight,
    value.proposalBottomRight,
    value.proposalBottomLeft,
  ]);
  if (refined === null || proposal === null) return null;
  if (!Array.isArray(value.signature)) return null;
  const signatureLength = value.signature.length;
  if (signatureLength !== (value.detected ? SIGNATURE_LENGTH : 0)) return null;
  const signature: number[] = [];
  for (let index = 0; index < signatureLength; index += 1) {
    const cell: unknown = value.signature[index];
    if (!isFiniteInRange(cell, 0, 255)) return null;
    signature.push(cell);
  }
  if (!Array.isArray(value.edgeSupports)) return null;
  const supportLength = value.edgeSupports.length;
  if (supportLength !== 0 && supportLength !== 4) return null;
  const edgeSupports: number[] = [];
  for (let index = 0; index < supportLength; index += 1) {
    const support: unknown = value.edgeSupports[index];
    if (!isFiniteInRange(support, 0, 1)) return null;
    edgeSupports.push(support);
  }
  if (!Number.isInteger(value.fallbackEdges)) return null;
  if (!isFiniteInRange(value.fallbackEdges, 0, 1)) return null;
  if (!value.detected && value.fallbackEdges !== 0) return null;

  return {
    detected: value.detected,
    topLeft: refined[0],
    topRight: refined[1],
    bottomRight: refined[2],
    bottomLeft: refined[3],
    proposalDetected: value.proposalDetected,
    proposalTopLeft: proposal[0],
    proposalTopRight: proposal[1],
    proposalBottomRight: proposal[2],
    proposalBottomLeft: proposal[3],
    confidence: normalizedUnit(value.confidence),
    areaRatio: normalizedUnit(value.areaRatio),
    aspectRatio: normalizedUnit(value.aspectRatio),
    centerOffset: normalizedUnit(value.centerOffset),
    edgeSupportMin: normalizedUnit(value.edgeSupportMin),
    shiftTop: value.shiftTop,
    shiftRight: value.shiftRight,
    shiftBottom: value.shiftBottom,
    shiftLeft: value.shiftLeft,
    refinementStatus: value.refinementStatus,
    signature,
    edgeSupports,
    fallbackEdges: value.fallbackEdges,
    proposalDurationMs: value.proposalDurationMs,
    nativeDurationMs: value.nativeDurationMs,
    orientationCode: value.orientationCode,
    runtimeErrorCode: value.runtimeErrorCode,
  };
}

export function orientedFrameDimensions(
  width: number,
  height: number,
  orientationCode: number,
): { width: number; height: number } | null {
  "worklet";
  if (!(width > 0) || !(height > 0)) return null;
  switch (orientationCode) {
    case 0:
    case 1:
    case 4:
    case 5:
      return { width, height };
    case 2:
    case 3:
    case 6:
    case 7:
      return { width: height, height: width };
    default:
      return null;
  }
}

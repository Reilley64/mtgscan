export type DetectorPoint = Readonly<{ x: number; y: number }>;

export type NativeRectangleRecord = Readonly<{
  detected: boolean;
  topLeft: DetectorPoint | null;
  topRight: DetectorPoint | null;
  bottomRight: DetectorPoint | null;
  bottomLeft: DetectorPoint | null;
  confidence: number;
  areaRatio: number;
  aspectRatio: number;
  centerOffset: number;
  centerScore: number;
  nativeDurationMs: number;
  roiX: number;
  roiY: number;
  roiWidth: number;
  roiHeight: number;
  orientationCode: number;
  runtimeErrorCode: number;
}>;

const NATIVE_KEYS = [
  "detected",
  "topLeft",
  "topRight",
  "bottomRight",
  "bottomLeft",
  "confidence",
  "areaRatio",
  "aspectRatio",
  "centerOffset",
  "centerScore",
  "nativeDurationMs",
  "roiX",
  "roiY",
  "roiWidth",
  "roiHeight",
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

const validatePoint = (value: unknown): DetectorPoint | null => {
  "worklet";
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !("x" in value) || !("y" in value)) return null;
  if (!isFiniteInRange(value.x, -0.000_001, 1.000_001)) return null;
  if (!isFiniteInRange(value.y, -0.000_001, 1.000_001)) return null;
  return { x: normalizedUnit(value.x), y: normalizedUnit(value.y) };
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
  if (!Number.isInteger(value.orientationCode)) return null;
  if (!Number.isInteger(value.runtimeErrorCode)) return null;
  if (!isFiniteInRange(value.orientationCode, -1, 7)) return null;
  if (!isFiniteInRange(value.runtimeErrorCode, 0, 4)) return null;
  if (!isFiniteInRange(value.confidence, 0, 1)) return null;
  if (!isFiniteInRange(value.areaRatio, 0, 1)) return null;
  if (!isFiniteInRange(value.aspectRatio, 0, 1)) return null;
  if (!isFiniteInRange(value.centerOffset, 0, 1)) return null;
  if (!isFiniteInRange(value.centerScore, 0, 1)) return null;
  if (!isFiniteInRange(value.nativeDurationMs, 0, 10_000)) return null;
  if (!isFiniteInRange(value.roiX, 0, 1)) return null;
  if (!isFiniteInRange(value.roiY, 0, 1)) return null;
  if (!isFiniteInRange(value.roiWidth, 0, 1)) return null;
  if (!isFiniteInRange(value.roiHeight, 0, 1)) return null;
  if (value.roiX + value.roiWidth > 1.000_001) return null;
  if (value.roiY + value.roiHeight > 1.000_001) return null;

  const topLeft = validatePoint(value.topLeft);
  const topRight = validatePoint(value.topRight);
  const bottomRight = validatePoint(value.bottomRight);
  const bottomLeft = validatePoint(value.bottomLeft);
  if (value.detected) {
    if (
      value.runtimeErrorCode !== 0 ||
      topLeft === null ||
      topRight === null ||
      bottomRight === null ||
      bottomLeft === null
    )
      return null;
  } else if (
    (value.topLeft !== null && value.topLeft !== undefined) ||
    (value.topRight !== null && value.topRight !== undefined) ||
    (value.bottomRight !== null && value.bottomRight !== undefined) ||
    (value.bottomLeft !== null && value.bottomLeft !== undefined) ||
    topLeft !== null ||
    topRight !== null ||
    bottomRight !== null ||
    bottomLeft !== null
  ) {
    return null;
  }

  return {
    detected: value.detected,
    topLeft,
    topRight,
    bottomRight,
    bottomLeft,
    confidence: normalizedUnit(value.confidence),
    areaRatio: normalizedUnit(value.areaRatio),
    aspectRatio: normalizedUnit(value.aspectRatio),
    centerOffset: normalizedUnit(value.centerOffset),
    centerScore: normalizedUnit(value.centerScore),
    nativeDurationMs: value.nativeDurationMs,
    roiX: normalizedUnit(value.roiX),
    roiY: normalizedUnit(value.roiY),
    roiWidth: normalizedUnit(value.roiWidth),
    roiHeight: normalizedUnit(value.roiHeight),
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

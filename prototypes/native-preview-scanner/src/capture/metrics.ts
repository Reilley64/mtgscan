import { ANALYSIS_MARGIN_FRACTION, type CaptureThresholds } from "./config";

export type PreviewMetrics = {
  borderEnergy: number;
  borderContinuity: number;
  centerScore: number;
  interiorVariance: number;
  sharpness: number;
  motion: number;
  processingMs: number;
};

export type PreviewGates = {
  present: boolean;
  centered: boolean;
  sharp: boolean;
  stable: boolean;
  departed: boolean;
  all: boolean;
};

export type MetricResult = {
  metrics: PreviewMetrics;
  signature: number[];
};

const lumaAt = (pixels: Uint8Array, pixelIndex: number, channels: 3 | 4) => {
  "worklet";
  const offset = pixelIndex * channels + (channels === 4 ? 1 : 0);
  return (
    (pixels[offset]! * 77 +
      pixels[offset + 1]! * 150 +
      pixels[offset + 2]! * 29) /
    256
  );
};

const edgeSample = (
  pixels: Uint8Array,
  width: number,
  channels: 3 | 4,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) => {
  "worklet";
  return Math.abs(
    lumaAt(pixels, y1 * width + x1, channels) -
      lumaAt(pixels, y2 * width + x2, channels),
  );
};

export function computePreviewMetrics(
  pixels: Uint8Array,
  width: number,
  height: number,
  channels: 3 | 4,
  previousSignature: number[] | null,
): MetricResult {
  "worklet";
  const cardCoverage = 1 / (1 + 2 * ANALYSIS_MARGIN_FRACTION);
  const insetX = Math.max(2, Math.round((width * (1 - cardCoverage)) / 2));
  const insetY = Math.max(2, Math.round((height * (1 - cardCoverage)) / 2));
  const sampleOffset = Math.max(1, Math.round(Math.min(width, height) * 0.018));
  const leftX = insetX;
  const rightX = width - 1 - insetX;
  const topY = insetY;
  const bottomY = height - 1 - insetY;
  const xStart = Math.round(width * 0.14);
  const xEnd = Math.round(width * 0.86);
  const yStart = Math.round(height * 0.14);
  const yEnd = Math.round(height * 0.86);

  let leftEnergy = 0;
  let rightEnergy = 0;
  let verticalSamples = 0;
  let continuous = 0;
  for (let y = yStart; y <= yEnd; y += 2) {
    const left = edgeSample(
      pixels,
      width,
      channels,
      leftX - sampleOffset,
      y,
      leftX + sampleOffset,
      y,
    );
    const right = edgeSample(
      pixels,
      width,
      channels,
      rightX + sampleOffset,
      y,
      rightX - sampleOffset,
      y,
    );
    leftEnergy += left;
    rightEnergy += right;
    if (left >= 18) continuous++;
    if (right >= 18) continuous++;
    verticalSamples++;
  }

  let topEnergy = 0;
  let bottomEnergy = 0;
  let horizontalSamples = 0;
  for (let x = xStart; x <= xEnd; x += 2) {
    const top = edgeSample(
      pixels,
      width,
      channels,
      x,
      topY - sampleOffset,
      x,
      topY + sampleOffset,
    );
    const bottom = edgeSample(
      pixels,
      width,
      channels,
      x,
      bottomY + sampleOffset,
      x,
      bottomY - sampleOffset,
    );
    topEnergy += top;
    bottomEnergy += bottom;
    if (top >= 18) continuous++;
    if (bottom >= 18) continuous++;
    horizontalSamples++;
  }

  leftEnergy /= Math.max(1, verticalSamples);
  rightEnergy /= Math.max(1, verticalSamples);
  topEnergy /= Math.max(1, horizontalSamples);
  bottomEnergy /= Math.max(1, horizontalSamples);
  const borderEnergy =
    (leftEnergy + rightEnergy + topEnergy + bottomEnergy) / 4;
  const borderContinuity =
    continuous / Math.max(1, 2 * verticalSamples + 2 * horizontalSamples);
  const horizontalBalance =
    Math.min(leftEnergy, rightEnergy) /
    Math.max(1, Math.max(leftEnergy, rightEnergy));
  const verticalBalance =
    Math.min(topEnergy, bottomEnergy) /
    Math.max(1, Math.max(topEnergy, bottomEnergy));
  const centerScore = (horizontalBalance + verticalBalance) / 2;

  const innerLeft = Math.max(insetX + 5, Math.round(width * 0.12));
  const innerRight = Math.min(width - insetX - 6, Math.round(width * 0.88));
  const innerTop = Math.max(insetY + 5, Math.round(height * 0.12));
  const innerBottom = Math.min(height - insetY - 6, Math.round(height * 0.88));
  let count = 0;
  let mean = 0;
  let sumSquares = 0;
  let laplacian = 0;
  let laplacianCount = 0;
  for (let y = innerTop; y <= innerBottom; y += 2) {
    for (let x = innerLeft; x <= innerRight; x += 2) {
      const value = lumaAt(pixels, y * width + x, channels);
      count++;
      const delta = value - mean;
      mean += delta / count;
      sumSquares += delta * (value - mean);
      if (x > innerLeft && x < innerRight && y > innerTop && y < innerBottom) {
        const left = lumaAt(pixels, y * width + x - 1, channels);
        const right = lumaAt(pixels, y * width + x + 1, channels);
        const up = lumaAt(pixels, (y - 1) * width + x, channels);
        const down = lumaAt(pixels, (y + 1) * width + x, channels);
        laplacian += Math.abs(4 * value - left - right - up - down);
        laplacianCount++;
      }
    }
  }
  const interiorVariance = sumSquares / Math.max(1, count - 1);
  const sharpness = laplacian / Math.max(1, laplacianCount);

  const signature: number[] = [];
  const signatureColumns = 6;
  const signatureRows = 8;
  for (let row = 0; row < signatureRows; row++) {
    for (let column = 0; column < signatureColumns; column++) {
      const x0 = Math.floor((column * width) / signatureColumns);
      const x1 = Math.max(
        x0 + 1,
        Math.floor(((column + 1) * width) / signatureColumns),
      );
      const y0 = Math.floor((row * height) / signatureRows);
      const y1 = Math.max(
        y0 + 1,
        Math.floor(((row + 1) * height) / signatureRows),
      );
      let cellSum = 0;
      let cellCount = 0;
      for (let y = y0; y < y1; y += 2) {
        for (let x = x0; x < x1; x += 2) {
          cellSum += lumaAt(pixels, y * width + x, channels);
          cellCount++;
        }
      }
      signature.push(cellSum / Math.max(1, cellCount));
    }
  }

  let motion = 255;
  if (
    previousSignature !== null &&
    previousSignature.length === signature.length
  ) {
    motion = 0;
    for (let index = 0; index < signature.length; index++) {
      motion += Math.abs(signature[index]! - previousSignature[index]!);
    }
    motion /= signature.length;
  }

  return {
    metrics: {
      borderEnergy,
      borderContinuity,
      centerScore,
      interiorVariance,
      sharpness,
      motion,
      processingMs: 0,
    },
    signature,
  };
}

export function evaluatePreviewGates(
  metrics: PreviewMetrics,
  thresholds: CaptureThresholds,
): PreviewGates {
  "worklet";
  const present =
    metrics.borderEnergy >= thresholds.borderEnergyMin &&
    metrics.borderContinuity >= thresholds.borderContinuityMin &&
    metrics.interiorVariance >= thresholds.interiorVarianceMin;
  const centered = metrics.centerScore >= thresholds.centerScoreMin;
  const sharp = metrics.sharpness >= thresholds.sharpnessMin;
  const stable = metrics.motion <= thresholds.motionMax;
  const departed =
    metrics.borderContinuity <= thresholds.departureBorderContinuityMax &&
    metrics.interiorVariance <= thresholds.departureVarianceMax;
  return {
    present,
    centered,
    sharp,
    stable,
    departed,
    all: present && centered && sharp && stable,
  };
}

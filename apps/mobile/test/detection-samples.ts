import type { DetectionSample, FrameQuad } from '../modules/card-detector';
import { showSamples } from './fake-card-detector';

const sampleIntervalMs = 200;

export function quad(left: number, top: number, right: number, bottom: number): FrameQuad {
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

export function cardSignature(seed: number) {
  return Array.from({ length: 48 }, (_, index) =>
    Math.round(128 + 100 * Math.sin(seed * 1.7 + index * (0.9 + seed * 0.13))),
  );
}

export type SampleShape = Omit<DetectionSample, 'sampledAtMs'>;

export function card({ offset = 0, seed = 1 }: { offset?: number; seed?: number } = {}): SampleShape {
  return {
    detected: true,
    corners: quad(0.2 + offset, 0.2, 0.8 + offset, 0.8),
    proposalDetected: true,
    proposalCorners: quad(0.25, 0.25, 0.75, 0.75),
    confidence: 0.9,
    areaRatio: 0.36,
    aspectRatio: 63 / 88,
    edgeSupportMin: 0.8,
    signature: cardSignature(seed),
    frameWidth: 720,
    frameHeight: 1280,
    nativeDurationMs: 14,
    runtimeErrorCode: null,
  };
}

export function noCard({
  proposal = null,
  confidence = 0,
}: { proposal?: FrameQuad | null; confidence?: number } = {}): SampleShape {
  return {
    detected: false,
    corners: null,
    proposalDetected: proposal !== null,
    proposalCorners: proposal,
    confidence,
    areaRatio: 0,
    aspectRatio: 0,
    edgeSupportMin: 0,
    signature: [],
    frameWidth: 720,
    frameHeight: 1280,
    nativeDurationMs: 12,
    runtimeErrorCode: null,
  };
}

export const emptySurface = () => noCard({ proposal: quad(0.01, 0.01, 0.99, 0.99), confidence: 0.57 });

export function repeat(count: number, sample: () => SampleShape) {
  return Array.from({ length: count }, sample);
}

let clockMs = 0;

export function resetSampleClock() {
  clockMs = 0;
}

export async function pause(ms: number) {
  clockMs += ms;
}

function timed(samples: SampleShape[]): DetectionSample[] {
  return samples.map((sample) => {
    clockMs += sampleIntervalMs;
    return { ...sample, sampledAtMs: clockMs };
  });
}

export async function scan(samples: SampleShape[]) {
  await showSamples(timed(samples));
}

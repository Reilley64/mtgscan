import type { DetectionSample, FrameQuad } from '../../modules/card-detector';

export type CapturePhase = 'seeking' | 'holding' | 'capturing' | 'cooldown' | 'error';

export type CaptureMachineState = {
  phase: CapturePhase;
  holdStartedAt: number | null;
  departureStartedAt: number | null;
  captureLocked: boolean;
  captureInFlight: boolean;
};

export type CaptureGates = {
  present: boolean;
  stable: boolean;
  departed: boolean;
  all: boolean;
};

export type CaptureState = {
  machine: CaptureMachineState;
  previousCorners: number[] | null;
  capturedSignature: number[] | null;
  lastSampledAtMs: number | null;
  failedPhotos: number;
};

export type CaptureStep = {
  state: CaptureState;
  requestPhoto: boolean;
};

export const captureRule = {
  dwellMs: 400,
  departureMs: 1000,
  resumeGapMs: 1000,
  stableMotionMax: 0.04,
  changeCorrelationMax: 0.6,
  cardEvidenceConfidenceMin: 0.6,
  cardEvidenceAreaMax: 0.6,
  failedPhotosMax: 3,
} as const;

const signatureColumns = 8;
const signatureRows = 6;

function seeking(): CaptureMachineState {
  return {
    phase: 'seeking',
    holdStartedAt: null,
    departureStartedAt: null,
    captureLocked: false,
    captureInFlight: false,
  };
}

function cooldown(holdStartedAt: number | null, departureStartedAt: number | null): CaptureMachineState {
  return {
    phase: 'cooldown',
    holdStartedAt,
    departureStartedAt,
    captureLocked: true,
    captureInFlight: false,
  };
}

function stopped(): CaptureMachineState {
  return {
    phase: 'error',
    holdStartedAt: null,
    departureStartedAt: null,
    captureLocked: true,
    captureInFlight: false,
  };
}

function copyMachine(state: CaptureMachineState): CaptureMachineState {
  return {
    phase: state.phase,
    holdStartedAt: state.holdStartedAt,
    departureStartedAt: state.departureStartedAt,
    captureLocked: state.captureLocked,
    captureInFlight: state.captureInFlight,
  };
}

export function advanceCaptureMachine(
  state: CaptureMachineState,
  gates: CaptureGates,
  nowMs: number,
): { state: CaptureMachineState; requestCapture: boolean } {
  if (state.phase === 'error' || state.phase === 'capturing') {
    return { state: copyMachine(state), requestCapture: false };
  }
  if (state.phase === 'cooldown') {
    if (!gates.departed) {
      return { state: cooldown(state.holdStartedAt, null), requestCapture: false };
    }
    const departureStartedAt = state.departureStartedAt ?? nowMs;
    if (nowMs - departureStartedAt >= captureRule.departureMs) {
      return { state: seeking(), requestCapture: false };
    }
    return { state: cooldown(state.holdStartedAt, departureStartedAt), requestCapture: false };
  }
  if (!gates.all) {
    return { state: seeking(), requestCapture: false };
  }
  const holdStartedAt = state.holdStartedAt ?? nowMs;
  if (nowMs - holdStartedAt < captureRule.dwellMs) {
    return {
      state: {
        phase: 'holding',
        holdStartedAt,
        departureStartedAt: null,
        captureLocked: false,
        captureInFlight: false,
      },
      requestCapture: false,
    };
  }
  if (state.captureLocked) {
    return { state: copyMachine(state), requestCapture: false };
  }
  return {
    state: {
      phase: 'capturing',
      holdStartedAt,
      departureStartedAt: null,
      captureLocked: true,
      captureInFlight: true,
    },
    requestCapture: true,
  };
}

function resumeAfterGap(state: CaptureMachineState): CaptureMachineState {
  if (state.phase === 'holding') return seeking();
  if (state.phase === 'cooldown') return cooldown(state.holdStartedAt, null);
  return copyMachine(state);
}

function pixelCorners(corners: FrameQuad | null, width: number, height: number): number[] | null {
  if (corners === null) return null;
  return corners.flatMap((corner) => [corner.x * width, corner.y * height]);
}

function quadMotion(previous: number[] | null, current: number[] | null): number | null {
  if (previous === null || current === null) return null;
  const side = (first: number, second: number) =>
    Math.hypot(current[second * 2] - current[first * 2], current[second * 2 + 1] - current[first * 2 + 1]);
  const shortSide = Math.min((side(0, 1) + side(3, 2)) / 2, (side(0, 3) + side(1, 2)) / 2);
  if (!(shortSide > 0)) return null;
  let largest = 0;
  for (let index = 0; index < 4; index += 1) {
    largest = Math.max(
      largest,
      Math.hypot(current[index * 2] - previous[index * 2], current[index * 2 + 1] - previous[index * 2 + 1]),
    );
  }
  return largest / shortSide;
}

function quadArea(corners: FrameQuad | null): number {
  if (corners === null) return 0;
  let twiceArea = 0;
  corners.forEach((corner, index) => {
    const next = corners[(index + 1) % 4];
    twiceArea += corner.x * next.y - next.x * corner.y;
  });
  return Math.abs(twiceArea) / 2;
}

function signatureGradient(signature: readonly number[]): number[] {
  const gradient: number[] = [];
  for (let row = 0; row < signatureRows; row += 1) {
    for (let column = 0; column + 1 < signatureColumns; column += 1) {
      gradient.push(signature[row * signatureColumns + column + 1] - signature[row * signatureColumns + column]);
    }
  }
  for (let row = 0; row + 1 < signatureRows; row += 1) {
    for (let column = 0; column < signatureColumns; column += 1) {
      gradient.push(signature[(row + 1) * signatureColumns + column] - signature[row * signatureColumns + column]);
    }
  }
  return gradient;
}

function signatureCorrelation(first: readonly number[] | null, second: readonly number[]): number | null {
  const cells = signatureColumns * signatureRows;
  if (first === null || first.length !== cells || second.length !== cells) return null;
  const a = signatureGradient(first);
  const b = signatureGradient(second);
  const mean = (values: number[]) => values.reduce((total, value) => total + value, 0) / values.length;
  const firstMean = mean(a);
  const secondMean = mean(b);
  let product = 0;
  let firstSquares = 0;
  let secondSquares = 0;
  a.forEach((value, index) => {
    const x = value - firstMean;
    const y = b[index] - secondMean;
    product += x * y;
    firstSquares += x * x;
    secondSquares += y * y;
  });
  const scale = Math.sqrt(firstSquares * secondSquares);
  return scale > 0 ? product / scale : null;
}

function captureGates(sample: DetectionSample, motion: number | null, changeCorrelation: number | null): CaptureGates {
  const present = sample.detected;
  const stable = motion !== null && motion <= captureRule.stableMotionMax;
  const cardEvidence =
    present ||
    (sample.proposalDetected &&
      sample.confidence >= captureRule.cardEvidenceConfidenceMin &&
      quadArea(sample.proposalCorners) <= captureRule.cardEvidenceAreaMax);
  const changed = present && changeCorrelation !== null && changeCorrelation < captureRule.changeCorrelationMax;
  return { present, stable, departed: !cardEvidence || changed, all: present && stable };
}

export function initialCapture(): CaptureState {
  return {
    machine: seeking(),
    previousCorners: null,
    capturedSignature: null,
    lastSampledAtMs: null,
    failedPhotos: 0,
  };
}

export function observeSample(state: CaptureState, sample: DetectionSample): CaptureStep {
  if (sample.runtimeErrorCode !== null) {
    return { state: { ...state, machine: stopped(), lastSampledAtMs: sample.sampledAtMs }, requestPhoto: false };
  }
  const resumed =
    state.lastSampledAtMs !== null && sample.sampledAtMs - state.lastSampledAtMs > captureRule.resumeGapMs;
  const machine = resumed ? resumeAfterGap(state.machine) : state.machine;
  const corners = pixelCorners(sample.corners, sample.frameWidth, sample.frameHeight);
  const motion = quadMotion(resumed ? null : state.previousCorners, corners);
  const changeCorrelation = sample.detected ? signatureCorrelation(state.capturedSignature, sample.signature) : null;
  const transition = advanceCaptureMachine(machine, captureGates(sample, motion, changeCorrelation), sample.sampledAtMs);
  const capturedSignature = transition.requestCapture
    ? [...sample.signature]
    : transition.state.captureLocked
      ? state.capturedSignature
      : null;
  return {
    state: {
      machine: transition.state,
      previousCorners: corners,
      capturedSignature,
      lastSampledAtMs: sample.sampledAtMs,
      failedPhotos: state.failedPhotos,
    },
    requestPhoto: transition.requestCapture,
  };
}

export function photoTaken(state: CaptureState): CaptureState {
  if (!state.machine.captureInFlight) return state;
  return { ...state, machine: cooldown(state.machine.holdStartedAt, null), failedPhotos: 0 };
}

export function photoFailed(state: CaptureState): CaptureState {
  const failedPhotos = state.failedPhotos + 1;
  return {
    machine: failedPhotos >= captureRule.failedPhotosMax ? stopped() : seeking(),
    previousCorners: null,
    capturedSignature: null,
    lastSampledAtMs: state.lastSampledAtMs,
    failedPhotos,
  };
}

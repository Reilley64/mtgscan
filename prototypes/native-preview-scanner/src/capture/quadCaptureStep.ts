import type { CaptureThresholds } from "./config";
import type { PreviewGates } from "./metrics";
import {
  advanceCaptureMachine,
  completeCapture,
  initialCaptureMachineState,
  nextCaptureGuard,
  recoverFromCaptureFailure,
  resumeCaptureMachine,
  type CaptureMachineState,
} from "./stateMachine";
import {
  evaluateQuadCaptureGates,
  matchesBackground,
  quadMotion,
  refinedCorners,
  signatureCorrelation,
  type QuadCorners,
} from "./quadCaptureGates";
import type { NativeRectangleRecord } from "../detector/validation";

export type QuadCaptureState = Readonly<{
  machine: CaptureMachineState;
  guard: boolean;
  previousCorners: QuadCorners | null;
  capturedSignature: number[] | null;
}>;

export type QuadCaptureStep = Readonly<{
  state: QuadCaptureState;
  requestPhoto: boolean;
  background: boolean;
  captureGates: PreviewGates;
  motion: number | null;
  changeCorrelation: number | null;
}>;

export function stepQuadCapture(
  state: Readonly<{
    machine: CaptureMachineState;
    guard: boolean;
    previousCorners: QuadCorners | null;
    capturedSignature: readonly number[] | null;
    backgrounds?: readonly (readonly number[])[];
  }>,
  observation: NativeRectangleRecord,
  detectorGatesPass: boolean,
  orientedWidth: number,
  orientedHeight: number,
  nowMs: number,
  timing: CaptureThresholds,
): QuadCaptureStep {
  "worklet";
  const corners = refinedCorners(observation, orientedWidth, orientedHeight);
  const motion = quadMotion(state.previousCorners, corners);
  const changeCorrelation = observation.detected
    ? signatureCorrelation(state.capturedSignature, observation.signature)
    : null;
  const background =
    observation.detected &&
    matchesBackground(observation.signature, state.backgrounds ?? []);
  const captureGates = evaluateQuadCaptureGates(
    observation,
    detectorGatesPass && !background,
    motion,
    changeCorrelation,
  );
  const transition = advanceCaptureMachine(
    state.machine,
    captureGates,
    nowMs,
    timing,
  );
  const decision = nextCaptureGuard(state.guard, transition);
  const source = decision.requestPhoto
    ? observation.signature
    : transition.state.captureLocked
      ? state.capturedSignature
      : null;
  let capturedSignature: number[] | null = null;
  if (source !== null) {
    capturedSignature = [];
    for (let index = 0; index < source.length; index += 1)
      capturedSignature.push(source[index]!);
  }
  return {
    state: {
      machine: transition.state,
      guard: decision.guard,
      previousCorners: corners,
      capturedSignature,
    },
    requestPhoto: decision.requestPhoto,
    background,
    captureGates,
    motion,
    changeCorrelation,
  };
}

export type CaptureCommands = Readonly<{
  resets: number;
  photosDone: number;
  photosFailed: number;
  failureStreak: number;
  rearms: number;
  resumes: number;
}>;

export type AppliedCaptureCommands = Readonly<{
  resets: number;
  photosDone: number;
  photosFailed: number;
  rearms: number;
  resumes: number;
}>;

export const NO_CAPTURE_COMMANDS: CaptureCommands = {
  resets: 0,
  photosDone: 0,
  photosFailed: 0,
  failureStreak: 0,
  rearms: 0,
  resumes: 0,
};

export const NO_APPLIED_CAPTURE_COMMANDS: AppliedCaptureCommands = {
  resets: 0,
  photosDone: 0,
  photosFailed: 0,
  rearms: 0,
  resumes: 0,
};

export function applyCaptureCommands(
  state: Readonly<{
    machine: CaptureMachineState;
    guard: boolean;
    previousCorners: QuadCorners | null;
    capturedSignature: readonly number[] | null;
  }>,
  commands: CaptureCommands,
  applied: AppliedCaptureCommands,
): { state: QuadCaptureState; applied: AppliedCaptureCommands } {
  "worklet";
  let machine: CaptureMachineState = {
    phase: state.machine.phase,
    holdStartedAt: state.machine.holdStartedAt,
    departureStartedAt: state.machine.departureStartedAt,
    captureLocked: state.machine.captureLocked,
    captureInFlight: state.machine.captureInFlight,
  };
  let guard = state.guard;
  let previousCorners = state.previousCorners;
  let keepSignature = true;
  if (commands.resets > applied.resets) {
    machine = initialCaptureMachineState();
    guard = false;
    previousCorners = null;
    keepSignature = false;
  }
  if (commands.photosDone > applied.photosDone) {
    machine = completeCapture(machine);
  }
  if (commands.photosFailed > applied.photosFailed) {
    machine = recoverFromCaptureFailure(commands.failureStreak);
    previousCorners = null;
    keepSignature = false;
  }
  if (commands.rearms > applied.rearms && machine.phase === "cooldown") {
    machine = initialCaptureMachineState();
    keepSignature = false;
  }
  if (commands.resumes > applied.resumes) {
    machine = resumeCaptureMachine(machine);
    previousCorners = null;
  }
  let capturedSignature: number[] | null = null;
  if (keepSignature && state.capturedSignature !== null) {
    capturedSignature = [];
    for (let index = 0; index < state.capturedSignature.length; index += 1)
      capturedSignature.push(state.capturedSignature[index]!);
  }
  return {
    state: { machine, guard, previousCorners, capturedSignature },
    applied: {
      resets: commands.resets,
      photosDone: commands.photosDone,
      photosFailed: commands.photosFailed,
      rearms: commands.rearms,
      resumes: commands.resumes,
    },
  };
}

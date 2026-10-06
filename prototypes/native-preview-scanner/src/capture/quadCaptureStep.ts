import type { CaptureThresholds } from "./config";
import type { PreviewGates } from "./metrics";
import {
  advanceCaptureMachine,
  nextCaptureGuard,
  type CaptureMachineState,
} from "./stateMachine";
import {
  evaluateQuadCaptureGates,
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
  const captureGates = evaluateQuadCaptureGates(
    observation,
    detectorGatesPass,
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
    captureGates,
    motion,
    changeCorrelation,
  };
}

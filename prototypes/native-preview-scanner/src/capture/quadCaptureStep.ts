import type { CaptureThresholds } from "./config";
import type { PreviewGates } from "./metrics";
import {
  advanceCaptureMachine,
  nextCaptureGuard,
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

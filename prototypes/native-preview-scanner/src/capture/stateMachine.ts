import type { CaptureThresholds } from "./config";
import type { PreviewGates } from "./metrics";

export type CapturePhase =
  "seeking" | "holding" | "capturing" | "cooldown" | "error";

export type CaptureMachineState = {
  phase: CapturePhase;
  holdStartedAt: number | null;
  departureStartedAt: number | null;
  captureLocked: boolean;
};

export type CaptureTransition = {
  state: CaptureMachineState;
  requestCapture: boolean;
};

export const initialCaptureMachineState = (): CaptureMachineState => {
  "worklet";
  return {
    phase: "seeking",
    holdStartedAt: null,
    departureStartedAt: null,
    captureLocked: false,
  };
};

export function advanceCaptureMachine(
  state: CaptureMachineState,
  gates: PreviewGates,
  nowMs: number,
  thresholds: CaptureThresholds,
): CaptureTransition {
  "worklet";
  if (state.phase === "error" || state.phase === "capturing") {
    return { state, requestCapture: false };
  }

  if (state.phase === "cooldown") {
    if (!gates.departed) {
      return {
        state: { ...state, departureStartedAt: null },
        requestCapture: false,
      };
    }
    const departureStartedAt = state.departureStartedAt ?? nowMs;
    if (nowMs - departureStartedAt >= thresholds.departureMs) {
      return { state: initialCaptureMachineState(), requestCapture: false };
    }
    return {
      state: { ...state, departureStartedAt },
      requestCapture: false,
    };
  }

  if (!gates.all) {
    return { state: initialCaptureMachineState(), requestCapture: false };
  }

  const holdStartedAt = state.holdStartedAt ?? nowMs;
  if (nowMs - holdStartedAt < thresholds.dwellMs) {
    return {
      state: {
        phase: "holding",
        holdStartedAt,
        departureStartedAt: null,
        captureLocked: false,
      },
      requestCapture: false,
    };
  }

  if (state.captureLocked) return { state, requestCapture: false };
  return {
    state: {
      phase: "capturing",
      holdStartedAt,
      departureStartedAt: null,
      captureLocked: true,
    },
    requestCapture: true,
  };
}

export function completeCapture(
  state: CaptureMachineState,
): CaptureMachineState {
  "worklet";
  if (!state.captureLocked) return state;
  return {
    phase: "cooldown",
    holdStartedAt: state.holdStartedAt,
    departureStartedAt: null,
    captureLocked: true,
  };
}

export function failCapture(): CaptureMachineState {
  "worklet";
  return {
    phase: "error",
    holdStartedAt: null,
    departureStartedAt: null,
    captureLocked: true,
  };
}

import type { CaptureThresholds } from "./config";
import type { PreviewGates } from "./metrics";

export type CapturePhase =
  "seeking" | "holding" | "capturing" | "cooldown" | "error";

export type CaptureMachineState = {
  phase: CapturePhase;
  holdStartedAt: number | null;
  departureStartedAt: number | null;
  captureLocked: boolean;
  captureInFlight: boolean;
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
    captureInFlight: false,
  };
};

function copyCaptureState(state: CaptureMachineState): CaptureMachineState {
  "worklet";
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
  gates: PreviewGates,
  nowMs: number,
  thresholds: CaptureThresholds,
): CaptureTransition {
  "worklet";
  if (state.phase === "error" || state.phase === "capturing") {
    return { state: copyCaptureState(state), requestCapture: false };
  }

  if (state.phase === "cooldown") {
    if (!gates.departed) {
      return {
        state: {
          phase: "cooldown",
          holdStartedAt: state.holdStartedAt,
          departureStartedAt: null,
          captureLocked: true,
          captureInFlight: false,
        },
        requestCapture: false,
      };
    }
    const departureStartedAt = state.departureStartedAt ?? nowMs;
    if (nowMs - departureStartedAt >= thresholds.departureMs) {
      return { state: initialCaptureMachineState(), requestCapture: false };
    }
    return {
      state: {
        phase: "cooldown",
        holdStartedAt: state.holdStartedAt,
        departureStartedAt,
        captureLocked: true,
        captureInFlight: false,
      },
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
        captureInFlight: false,
      },
      requestCapture: false,
    };
  }

  if (state.captureLocked)
    return { state: copyCaptureState(state), requestCapture: false };
  return {
    state: {
      phase: "capturing",
      holdStartedAt,
      departureStartedAt: null,
      captureLocked: true,
      captureInFlight: true,
    },
    requestCapture: true,
  };
}

export function completeCapture(
  state: CaptureMachineState,
): CaptureMachineState {
  "worklet";
  if (!state.captureInFlight) return state;
  return {
    phase: "cooldown",
    holdStartedAt: state.holdStartedAt,
    departureStartedAt: null,
    captureLocked: true,
    captureInFlight: false,
  };
}

export function failCapture(): CaptureMachineState {
  "worklet";
  return {
    phase: "error",
    holdStartedAt: null,
    departureStartedAt: null,
    captureLocked: true,
    captureInFlight: false,
  };
}

export function manualResetCaptureMachine(
  state: CaptureMachineState,
): CaptureMachineState {
  "worklet";
  return state.captureInFlight ? state : initialCaptureMachineState();
}

export function nextCaptureGuard(
  guard: boolean,
  transition: CaptureTransition,
): { guard: boolean; requestPhoto: boolean } {
  "worklet";
  if (!transition.state.captureLocked)
    return { guard: false, requestPhoto: false };
  if (transition.requestCapture && !guard)
    return { guard: true, requestPhoto: true };
  return { guard, requestPhoto: false };
}

export const RESUME_GAP_MS = 1000;
export const MAX_CONSECUTIVE_CAPTURE_FAILURES = 3;

export function resumeCaptureMachine(
  state: CaptureMachineState,
): CaptureMachineState {
  "worklet";
  if (state.phase === "holding") return initialCaptureMachineState();
  if (state.phase === "cooldown") {
    return {
      phase: "cooldown",
      holdStartedAt: state.holdStartedAt,
      departureStartedAt: null,
      captureLocked: true,
      captureInFlight: false,
    };
  }
  return copyCaptureState(state);
}

export function recoverFromCaptureFailure(
  consecutiveFailures: number,
): CaptureMachineState {
  "worklet";
  return consecutiveFailures >= MAX_CONSECUTIVE_CAPTURE_FAILURES
    ? failCapture()
    : initialCaptureMachineState();
}

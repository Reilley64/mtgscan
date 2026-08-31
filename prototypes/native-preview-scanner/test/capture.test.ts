import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTURE_THRESHOLDS } from "../src/capture/config";
import {
  computePreviewMetrics,
  evaluatePreviewGates,
  type PreviewGates,
} from "../src/capture/metrics";
import {
  advanceCaptureMachine,
  completeCapture,
  initialCaptureMachineState,
  manualResetCaptureMachine,
  failCapture,
} from "../src/capture/stateMachine";

const WIDTH = 96;
const HEIGHT = 134;

const setPixel = (pixels: Uint8Array, x: number, y: number, value: number) => {
  const offset = (y * WIDTH + x) * 3;
  pixels[offset] = value;
  pixels[offset + 1] = value;
  pixels[offset + 2] = value;
};

function syntheticCard({
  shiftX = 0,
  brightnessOffset = 0,
  blurred = false,
}: {
  shiftX?: number;
  brightnessOffset?: number;
  blurred?: boolean;
} = {}) {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 3);
  pixels.fill(25);
  const coverage = 1 / 1.08;
  const left = Math.round((WIDTH * (1 - coverage)) / 2) + shiftX;
  const right = WIDTH - 1 - Math.round((WIDTH * (1 - coverage)) / 2) + shiftX;
  const top = Math.round((HEIGHT * (1 - coverage)) / 2);
  const bottom = HEIGHT - 1 - Math.round((HEIGHT * (1 - coverage)) / 2);
  for (let y = top; y <= bottom; y++) {
    for (let x = Math.max(0, left); x <= Math.min(WIDTH - 1, right); x++) {
      let value: number;
      if (blurred) {
        value = 65 + ((x - left) * 110) / Math.max(1, right - left);
      } else {
        value = (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 ? 70 : 205;
      }
      setPixel(
        pixels,
        x,
        y,
        Math.max(0, Math.min(255, Math.round(value + brightnessOffset))),
      );
    }
  }
  return pixels;
}

const metricsFor = (
  pixels: Uint8Array,
  previousSignature: number[] | null = null,
) => computePreviewMetrics(pixels, WIDTH, HEIGHT, 3, previousSignature);

const allPassingGates: PreviewGates = {
  present: true,
  centered: true,
  sharp: true,
  stable: true,
  departed: false,
  all: true,
};

const absentGates: PreviewGates = {
  present: false,
  centered: false,
  sharp: false,
  stable: false,
  departed: true,
  all: false,
};

describe("synthetic preview metrics", () => {
  it("rejects no-card frames", () => {
    const flat = new Uint8Array(WIDTH * HEIGHT * 3);
    flat.fill(25);
    const result = metricsFor(flat);
    const gates = evaluatePreviewGates(
      result.metrics,
      DEFAULT_CAPTURE_THRESHOLDS,
    );
    expect(gates.present).toBe(false);
    expect(gates.departed).toBe(true);
  });

  it("rejects an off-center card", () => {
    const first = metricsFor(syntheticCard({ shiftX: 9 }));
    const second = metricsFor(syntheticCard({ shiftX: 9 }), first.signature);
    const gates = evaluatePreviewGates(
      second.metrics,
      DEFAULT_CAPTURE_THRESHOLDS,
    );
    expect(gates.centered).toBe(false);
    expect(gates.departed).toBe(false);
    expect(gates.all).toBe(false);
  });

  it("rejects motion", () => {
    const first = metricsFor(syntheticCard());
    const moving = metricsFor(
      syntheticCard({ brightnessOffset: 35 }),
      first.signature,
    );
    const gates = evaluatePreviewGates(
      moving.metrics,
      DEFAULT_CAPTURE_THRESHOLDS,
    );
    expect(gates.present).toBe(true);
    expect(gates.stable).toBe(false);
  });

  it("rejects a blurred card", () => {
    const first = metricsFor(syntheticCard({ blurred: true }));
    const second = metricsFor(
      syntheticCard({ blurred: true }),
      first.signature,
    );
    const gates = evaluatePreviewGates(
      second.metrics,
      DEFAULT_CAPTURE_THRESHOLDS,
    );
    expect(gates.present).toBe(true);
    expect(gates.sharp).toBe(false);
  });

  it("accepts a centered stable card", () => {
    const first = metricsFor(syntheticCard());
    const second = metricsFor(syntheticCard(), first.signature);
    const gates = evaluatePreviewGates(
      second.metrics,
      DEFAULT_CAPTURE_THRESHOLDS,
    );
    expect(gates).toEqual({
      present: true,
      centered: true,
      sharp: true,
      stable: true,
      departed: false,
      all: true,
    });
  });
});

describe("capture gate state machine", () => {
  it("requires the configured dwell before capture", () => {
    let state = initialCaptureMachineState();
    let transition = advanceCaptureMachine(
      state,
      allPassingGates,
      100,
      DEFAULT_CAPTURE_THRESHOLDS,
    );
    expect(transition.state.phase).toBe("holding");
    state = transition.state;
    transition = advanceCaptureMachine(
      state,
      allPassingGates,
      499,
      DEFAULT_CAPTURE_THRESHOLDS,
    );
    expect(transition.requestCapture).toBe(false);
    transition = advanceCaptureMachine(
      transition.state,
      allPassingGates,
      500,
      DEFAULT_CAPTURE_THRESHOLDS,
    );
    expect(transition.requestCapture).toBe(true);
    expect(transition.state.phase).toBe("capturing");
  });

  it("locks to one capture during the same presentation", () => {
    let state = advanceCaptureMachine(
      initialCaptureMachineState(),
      allPassingGates,
      0,
      DEFAULT_CAPTURE_THRESHOLDS,
    ).state;
    const capture = advanceCaptureMachine(
      state,
      allPassingGates,
      400,
      DEFAULT_CAPTURE_THRESHOLDS,
    );
    expect(capture.requestCapture).toBe(true);
    state = completeCapture(capture.state);
    for (const now of [600, 900, 1400]) {
      const next = advanceCaptureMachine(
        state,
        allPassingGates,
        now,
        DEFAULT_CAPTURE_THRESHOLDS,
      );
      expect(next.requestCapture).toBe(false);
      expect(next.state.phase).toBe("cooldown");
      state = next.state;
    }
  });

  it("ignores reset while a requested photo is in flight", () => {
    const capture = advanceCaptureMachine(
      {
        phase: "holding",
        holdStartedAt: 0,
        departureStartedAt: null,
        captureLocked: false,
        captureInFlight: false,
      },
      allPassingGates,
      400,
      DEFAULT_CAPTURE_THRESHOLDS,
    );

    expect(capture.requestCapture).toBe(true);
    expect(capture.state).toMatchObject({
      phase: "capturing",
      captureLocked: true,
      captureInFlight: true,
    });
    expect(manualResetCaptureMachine(capture.state)).toBe(capture.state);

    expect(manualResetCaptureMachine(completeCapture(capture.state))).toEqual(
      initialCaptureMachineState(),
    );
    expect(manualResetCaptureMachine(failCapture())).toEqual(
      initialCaptureMachineState(),
    );
  });

  it("resets only after card departure", () => {
    let state = completeCapture({
      phase: "capturing",
      holdStartedAt: 0,
      departureStartedAt: null,
      captureLocked: true,
      captureInFlight: true,
    });
    const displacedButPresent = {
      ...absentGates,
      departed: false,
    };
    state = advanceCaptureMachine(
      state,
      displacedButPresent,
      900,
      DEFAULT_CAPTURE_THRESHOLDS,
    ).state;
    expect(state.phase).toBe("cooldown");
    expect(state.departureStartedAt).toBeNull();
    state = advanceCaptureMachine(
      state,
      absentGates,
      1000,
      DEFAULT_CAPTURE_THRESHOLDS,
    ).state;
    expect(state.phase).toBe("cooldown");
    state = advanceCaptureMachine(
      state,
      absentGates,
      1399,
      DEFAULT_CAPTURE_THRESHOLDS,
    ).state;
    expect(state.phase).toBe("cooldown");
    state = advanceCaptureMachine(
      state,
      absentGates,
      1400,
      DEFAULT_CAPTURE_THRESHOLDS,
    ).state;
    expect(state).toEqual(initialCaptureMachineState());
  });
});

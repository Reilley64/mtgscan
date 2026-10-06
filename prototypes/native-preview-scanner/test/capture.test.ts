import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAPTURE_THRESHOLDS,
  QUAD_CAPTURE_TIMING,
} from "../src/capture/config";
import {
  evaluateQuadCaptureGates,
  proposalAreaRatio,
  quadMotion,
  refinedCorners,
  signatureCorrelation,
  signatureTexture,
} from "../src/capture/quadCaptureGates";
import {
  applyCaptureCommands,
  NO_APPLIED_CAPTURE_COMMANDS,
  NO_CAPTURE_COMMANDS,
  stepQuadCapture,
} from "../src/capture/quadCaptureStep";
import {
  recordAnalysisSample,
  recordProcessingTime,
  TIMING_WINDOW_SAMPLES,
} from "../src/capture/timingTelemetry";
import {
  orientedFrameDimensions,
  validateNativeRectangleRecord,
} from "../src/detector/validation";
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
  nextCaptureGuard,
  recoverFromCaptureFailure,
  resumeCaptureMachine,
  RESUME_GAP_MS,
  type CaptureMachineState,
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
  const coverage = 1 / 1.16;
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

describe("processing-time telemetry", () => {
  it("keeps only the most recent 300 samples", () => {
    const history: number[] = [];
    let telemetry = recordProcessingTime(history, 1);
    for (let value = 2; value <= TIMING_WINDOW_SAMPLES + 2; value++) {
      telemetry = recordProcessingTime(history, value);
    }

    expect(history).toHaveLength(TIMING_WINDOW_SAMPLES);
    expect(history[0]).toBe(3);
    expect(telemetry).toMatchObject({
      sampleCount: 300,
      p50Ms: 152,
      p95Ms: 287,
      maxMs: 302,
    });
  });

  it("uses nearest-rank percentiles", () => {
    const history: number[] = [];
    for (const value of [30, 10, 20, 40]) {
      recordProcessingTime(history, value);
    }

    expect(recordProcessingTime(history, 50)).toEqual({
      sampleCount: 5,
      p50Ms: 30,
      p95Ms: 50,
      maxMs: 50,
    });
  });
});

describe("analysis cadence telemetry", () => {
  it("waits for the full window even at sustained five-hertz cadence", () => {
    const processingHistory: number[] = [];
    const timestampHistory: number[] = [];
    let telemetry = recordAnalysisSample(
      processingHistory,
      timestampHistory,
      10,
      1_000,
    );
    for (let index = 1; index < TIMING_WINDOW_SAMPLES - 1; index++) {
      telemetry = recordAnalysisSample(
        processingHistory,
        timestampHistory,
        10,
        1_000 + index * 200,
      );
    }

    expect(telemetry).toMatchObject({
      sampleCount: 299,
      effectiveHz: 5,
      maxGapMs: 200,
      cadencePass: false,
    });
  });

  it("reports sustained five-hertz cadence over the full bounded window", () => {
    const processingHistory: number[] = [];
    const timestampHistory: number[] = [];
    let telemetry = recordAnalysisSample(
      processingHistory,
      timestampHistory,
      10,
      1_000,
    );
    for (let index = 1; index < TIMING_WINDOW_SAMPLES; index++) {
      telemetry = recordAnalysisSample(
        processingHistory,
        timestampHistory,
        10,
        1_000 + index * 200,
      );
    }

    expect(telemetry).toMatchObject({
      sampleCount: 300,
      effectiveHz: 5,
      maxGapMs: 200,
      cadencePass: true,
    });
    expect(telemetry.elapsedSpanMs).toBe(59_800);
  });

  it("does not equate 300 delayed samples with sustained five hertz", () => {
    const processingHistory: number[] = [];
    const timestampHistory: number[] = [];
    let telemetry = recordAnalysisSample(
      processingHistory,
      timestampHistory,
      10,
      0,
    );
    for (let index = 1; index < TIMING_WINDOW_SAMPLES; index++) {
      telemetry = recordAnalysisSample(
        processingHistory,
        timestampHistory,
        10,
        index * 250,
      );
    }

    expect(telemetry.sampleCount).toBe(300);
    expect(telemetry.effectiveHz).toBe(4);
    expect(telemetry.maxGapMs).toBe(250);
    expect(telemetry.cadencePass).toBe(false);
  });
});

const cardSignature = (seed: number) =>
  Array.from({ length: 48 }, (_, index) =>
    Math.round(128 + 100 * Math.sin(seed * 1.7 + index * (0.9 + seed * 0.13))),
  );

const validNativeRecord = () => ({
  detected: true,
  topLeft: { x: 0.2, y: 0.2 },
  topRight: { x: 0.8, y: 0.2 },
  bottomRight: { x: 0.8, y: 0.8 },
  bottomLeft: { x: 0.2, y: 0.8 },
  proposalDetected: true,
  proposalTopLeft: { x: 0.25, y: 0.25 },
  proposalTopRight: { x: 0.75, y: 0.25 },
  proposalBottomRight: { x: 0.75, y: 0.75 },
  proposalBottomLeft: { x: 0.25, y: 0.75 },
  confidence: 0.9,
  areaRatio: 0.36,
  aspectRatio: 63 / 88,
  centerOffset: 0,
  edgeSupportMin: 0.8,
  shiftTop: 0.08,
  shiftRight: 0.08,
  shiftBottom: 0.08,
  shiftLeft: -0.01,
  refinementStatus: 0,
  signature: cardSignature(1),
  edgeSupports: [0.9, 0.8, 1, 0.85],
  fallbackEdges: 0,
  proposalDurationMs: 3,
  nativeDurationMs: 5,
  orientationCode: 2,
  runtimeErrorCode: 0,
});

const undetectedRecord = (proposal: boolean) => ({
  ...validNativeRecord(),
  detected: false,
  topLeft: null,
  topRight: null,
  bottomRight: null,
  bottomLeft: null,
  proposalDetected: proposal,
  proposalTopLeft: proposal ? { x: 0.25, y: 0.25 } : null,
  proposalTopRight: proposal ? { x: 0.75, y: 0.25 } : null,
  proposalBottomRight: proposal ? { x: 0.75, y: 0.75 } : null,
  proposalBottomLeft: proposal ? { x: 0.25, y: 0.75 } : null,
  areaRatio: 0,
  aspectRatio: 0,
  centerOffset: 1,
  edgeSupportMin: proposal ? 0.4 : 0,
  shiftTop: 0,
  shiftRight: 0,
  shiftBottom: 0,
  shiftLeft: 0,
  refinementStatus: proposal ? 3 : 1,
  signature: [],
  edgeSupports: proposal ? [0.4, 0.9, 0.9, 0.9] : [],
  fallbackEdges: 0,
});

describe("native rectangle validation", () => {
  it("accepts only the fixed bounded record", () => {
    expect(validateNativeRectangleRecord(validNativeRecord())).toEqual(
      validNativeRecord(),
    );
    expect(
      validateNativeRectangleRecord({ ...validNativeRecord(), extra: 1 }),
    ).toBeNull();
    expect(
      validateNativeRectangleRecord({
        ...validNativeRecord(),
        topLeft: { x: 0.2, y: 0.2, extra: 1 },
      }),
    ).toBeNull();
    expect(
      validateNativeRectangleRecord({ ...validNativeRecord(), shiftTop: 1.5 }),
    ).toBeNull();
    expect(
      validateNativeRectangleRecord({
        ...validNativeRecord(),
        runtimeErrorCode: 6,
      }),
    ).toBeNull();
  });

  it("accepts one fallback edge only on a refined card", () => {
    expect(
      validateNativeRectangleRecord({
        ...validNativeRecord(),
        fallbackEdges: 1,
      }),
    ).toMatchObject({ fallbackEdges: 1 });
    expect(
      validateNativeRectangleRecord({
        ...undetectedRecord(true),
        fallbackEdges: 1,
      }),
    ).toBeNull();
    expect(
      validateNativeRectangleRecord({
        ...validNativeRecord(),
        fallbackEdges: 2,
      }),
    ).toBeNull();
    expect(
      validateNativeRectangleRecord({
        ...validNativeRecord(),
        edgeSupports: [1, 1],
      }),
    ).toBeNull();
  });

  it("requires a card signature only for a refined card", () => {
    expect(
      validateNativeRectangleRecord({
        ...validNativeRecord(),
        signature: [1, 2],
      }),
    ).toBeNull();
    expect(
      validateNativeRectangleRecord({
        ...undetectedRecord(true),
        signature: cardSignature(1),
      }),
    ).toBeNull();
    expect(
      validateNativeRectangleRecord({
        ...validNativeRecord(),
        signature: cardSignature(1).map((value, index) =>
          index === 3 ? 300 : value,
        ),
      }),
    ).toBeNull();
  });

  it("requires a refined card to come from a proposal", () => {
    expect(
      validateNativeRectangleRecord({
        ...validNativeRecord(),
        proposalDetected: false,
        proposalTopLeft: null,
        proposalTopRight: null,
        proposalBottomRight: null,
        proposalBottomLeft: null,
      }),
    ).toBeNull();
    expect(
      validateNativeRectangleRecord({
        ...validNativeRecord(),
        refinementStatus: 3,
      }),
    ).toBeNull();
    expect(
      validateNativeRectangleRecord({
        ...undetectedRecord(true),
        refinementStatus: 0,
      }),
    ).toBeNull();
  });

  it("keeps a weak-edge proposal visible without a refined quad", () => {
    expect(validateNativeRectangleRecord(undetectedRecord(true))).toMatchObject(
      {
        detected: false,
        topLeft: null,
        proposalDetected: true,
        proposalTopLeft: { x: 0.25, y: 0.25 },
        refinementStatus: 3,
      },
    );
  });

  it("requires either all four corners or no corners for each quad", () => {
    expect(
      validateNativeRectangleRecord(undetectedRecord(false)),
    ).not.toBeNull();
    expect(
      validateNativeRectangleRecord({
        ...undetectedRecord(false),
        topLeft: { x: 0.2, y: 0.2 },
      }),
    ).toBeNull();
    expect(
      validateNativeRectangleRecord({
        ...undetectedRecord(true),
        proposalBottomLeft: null,
      }),
    ).toBeNull();
    expect(
      validateNativeRectangleRecord({
        ...undetectedRecord(false),
        proposalTopLeft: { x: 0.25, y: 0.25 },
      }),
    ).toBeNull();
  });

  it("accepts VisionCamera's JSI representation of absent corners", () => {
    expect(
      validateNativeRectangleRecord({
        ...undetectedRecord(false),
        topLeft: undefined,
        topRight: undefined,
        bottomRight: undefined,
        bottomLeft: undefined,
        proposalTopLeft: undefined,
        proposalTopRight: undefined,
        proposalBottomRight: undefined,
        proposalBottomLeft: undefined,
      }),
    ).toMatchObject({
      detected: false,
      topLeft: null,
      topRight: null,
      bottomRight: null,
      bottomLeft: null,
      proposalTopLeft: null,
      proposalBottomLeft: null,
    });
  });

  it("maps all current orientation codes to oriented pixel dimensions", () => {
    for (const code of [0, 1, 4, 5]) {
      expect(orientedFrameDimensions(1280, 720, code)).toEqual({
        width: 1280,
        height: 720,
      });
    }
    for (const code of [2, 3, 6, 7]) {
      expect(orientedFrameDimensions(1280, 720, code)).toEqual({
        width: 720,
        height: 1280,
      });
    }
    expect(orientedFrameDimensions(1280, 720, -1)).toBeNull();
  });
});

const cardRecord = (offset = 0) => ({
  ...validNativeRecord(),
  topLeft: { x: 0.2 + offset, y: 0.2 },
  topRight: { x: 0.8 + offset, y: 0.2 },
  bottomRight: { x: 0.8 + offset, y: 0.8 },
  bottomLeft: { x: 0.2 + offset, y: 0.8 },
});

const flickerRecord = () => ({
  ...undetectedRecord(true),
  confidence: 0.95,
});

const emptySurfaceRecord = () => ({
  ...undetectedRecord(true),
  confidence: 0.57,
  proposalTopLeft: { x: 0.01, y: 0.01 },
  proposalTopRight: { x: 0.99, y: 0.01 },
  proposalBottomRight: { x: 0.99, y: 0.99 },
  proposalBottomLeft: { x: 0.01, y: 0.99 },
});

const initialQuadCaptureState = () => ({
  machine: initialCaptureMachineState(),
  guard: false,
  previousCorners: null,
  capturedSignature: null,
});

const runPresentation = (records: unknown[]) => {
  let state: Parameters<typeof stepQuadCapture>[0] = initialQuadCaptureState();
  let photos = 0;
  records.forEach((raw, index) => {
    const observation = validateNativeRectangleRecord(raw)!;
    const step = stepQuadCapture(
      state,
      observation,
      observation.detected,
      720,
      1280,
      index * 200,
      QUAD_CAPTURE_TIMING,
    );
    state = step.state;
    if (step.requestPhoto) {
      photos += 1;
      state = { ...state, machine: completeCapture(state.machine) };
    }
  });
  return { photos, state: state.machine };
};

describe("quad capture gates", () => {
  it("measures corner motion relative to the card short side", () => {
    const first = refinedCorners(
      validateNativeRectangleRecord(cardRecord())!,
      720,
      1280,
    );
    const moved = refinedCorners(
      validateNativeRectangleRecord(cardRecord(0.01))!,
      720,
      1280,
    );
    expect(quadMotion(first, first)).toBe(0);
    expect(quadMotion(first, moved)).toBeCloseTo(7.2 / 432, 5);
    expect(quadMotion(null, first)).toBeNull();
  });

  it("treats a confident card-sized proposal as card evidence", () => {
    const flicker = validateNativeRectangleRecord(flickerRecord())!;
    expect(proposalAreaRatio(flicker)).toBeCloseTo(0.25, 5);
    expect(evaluateQuadCaptureGates(flicker, false, null).departed).toBe(false);
    const empty = validateNativeRectangleRecord(emptySurfaceRecord())!;
    expect(evaluateQuadCaptureGates(empty, false, null).departed).toBe(true);
  });

  it("captures once after a steady hold and ignores refinement flicker", () => {
    const records = [
      ...Array.from({ length: 4 }, () => cardRecord()),
      flickerRecord(),
      flickerRecord(),
      flickerRecord(),
      flickerRecord(),
      ...Array.from({ length: 20 }, () => cardRecord()),
    ];
    const result = runPresentation(records);
    expect(result.photos).toBe(1);
    expect(result.state.phase).toBe("cooldown");
  });

  it("does not capture a moving card", () => {
    const records = Array.from({ length: 20 }, (_, index) =>
      cardRecord((index % 2) * 0.05),
    );
    expect(runPresentation(records).photos).toBe(0);
  });

  it("takes one photo per presentation after the card leaves", () => {
    const records = [
      ...Array.from({ length: 6 }, () => cardRecord()),
      ...Array.from({ length: 6 }, () => emptySurfaceRecord()),
      ...Array.from({ length: 6 }, () => cardRecord(0.02)),
      ...Array.from({ length: 6 }, () => emptySurfaceRecord()),
      ...Array.from({ length: 6 }, () => cardRecord()),
    ];
    expect(runPresentation(records).photos).toBe(3);
  });

  it("does not re-arm on a departure shorter than the departure time", () => {
    const records = [
      ...Array.from({ length: 6 }, () => cardRecord()),
      ...Array.from({ length: 2 }, () => emptySurfaceRecord()),
      ...Array.from({ length: 6 }, () => cardRecord()),
    ];
    expect(runPresentation(records).photos).toBe(1);
  });

  it("keeps a partly hidden card as card evidence during a handheld hold", () => {
    const partlyHidden = () => ({
      ...undetectedRecord(true),
      confidence: 0.76,
      proposalTopLeft: { x: 0.35, y: 0.4 },
      proposalTopRight: { x: 0.65, y: 0.4 },
      proposalBottomRight: { x: 0.65, y: 0.73 },
      proposalBottomLeft: { x: 0.35, y: 0.73 },
    });
    const records = [
      ...Array.from({ length: 6 }, () => cardRecord()),
      ...Array.from({ length: 4 }, () => partlyHidden()),
      ...Array.from({ length: 10 }, () => cardRecord()),
    ];
    expect(runPresentation(records).photos).toBe(1);
  });

  it("re-arms only after a full second without card evidence", () => {
    const shortGap = [
      ...Array.from({ length: 6 }, () => cardRecord()),
      ...Array.from({ length: 4 }, () => emptySurfaceRecord()),
      ...Array.from({ length: 6 }, () => cardRecord()),
    ];
    expect(runPresentation(shortGap).photos).toBe(1);
    const fullGap = [
      ...Array.from({ length: 6 }, () => cardRecord()),
      ...Array.from({ length: 7 }, () => emptySurfaceRecord()),
      ...Array.from({ length: 6 }, () => cardRecord()),
    ];
    expect(runPresentation(fullGap).photos).toBe(2);
  });

  it("never captures an empty surface", () => {
    const records = Array.from({ length: 50 }, () => emptySurfaceRecord());
    expect(runPresentation(records).photos).toBe(0);
  });
});

describe("worklet capture guard", () => {
  const locked = {
    phase: "capturing" as const,
    holdStartedAt: 0,
    departureStartedAt: null,
    captureLocked: true,
    captureInFlight: true,
  };

  it("requests one photo and blocks repeats while locked", () => {
    const first = nextCaptureGuard(false, {
      state: locked,
      requestCapture: true,
    });
    expect(first).toEqual({ guard: true, requestPhoto: true });
    expect(
      nextCaptureGuard(first.guard, { state: locked, requestCapture: true }),
    ).toEqual({ guard: true, requestPhoto: false });
  });

  it("releases the guard once the machine re-arms", () => {
    expect(
      nextCaptureGuard(true, {
        state: initialCaptureMachineState(),
        requestCapture: false,
      }),
    ).toEqual({ guard: false, requestPhoto: false });
  });
});

describe("shared-value state objects", () => {
  const hostObject = (state: CaptureMachineState): CaptureMachineState => {
    const host = {} as CaptureMachineState;
    for (const [key, value] of Object.entries(state)) {
      Object.defineProperty(host, key, { value, enumerable: false });
    }
    return host;
  };

  it("keeps the cooldown lock when state fields are not enumerable", () => {
    const cooldown = hostObject(
      completeCapture({
        phase: "capturing",
        holdStartedAt: 0,
        departureStartedAt: null,
        captureLocked: true,
        captureInFlight: true,
      }),
    );
    const present = advanceCaptureMachine(
      cooldown,
      allPassingGates,
      1000,
      QUAD_CAPTURE_TIMING,
    );
    expect(present.state).toMatchObject({
      phase: "cooldown",
      captureLocked: true,
    });
    const departing = advanceCaptureMachine(
      hostObject(present.state),
      absentGates,
      1200,
      QUAD_CAPTURE_TIMING,
    );
    expect(departing.state).toMatchObject({
      phase: "cooldown",
      captureLocked: true,
      departureStartedAt: 1200,
    });
    expect(
      advanceCaptureMachine(
        hostObject(departing.state),
        allPassingGates,
        1400,
        QUAD_CAPTURE_TIMING,
      ).requestCapture,
    ).toBe(false);
  });
});

describe("capture interruptions", () => {
  const darkFrame = () => ({ ...undetectedRecord(false), confidence: 0 });

  const runTimeline = (samples: { atMs: number; record: unknown }[]) => {
    let state: Parameters<typeof stepQuadCapture>[0] =
      initialQuadCaptureState();
    let previousAt = 0;
    let photos = 0;
    for (const sample of samples) {
      if (previousAt > 0 && sample.atMs - previousAt > RESUME_GAP_MS) {
        state = {
          ...state,
          previousCorners: null,
          machine: resumeCaptureMachine(state.machine),
        };
      }
      previousAt = sample.atMs;
      const observation = validateNativeRectangleRecord(sample.record)!;
      const step = stepQuadCapture(
        state,
        observation,
        observation.detected,
        720,
        1280,
        sample.atMs,
        QUAD_CAPTURE_TIMING,
      );
      state = step.state;
      if (step.requestPhoto) {
        photos += 1;
        state = { ...state, machine: completeCapture(state.machine) };
      }
    }
    return { photos, state: state.machine };
  };

  const every200 = (startMs: number, count: number, record: () => unknown) =>
    Array.from({ length: count }, (_, index) => ({
      atMs: startMs + index * 200,
      record: record(),
    }));

  it("does not retake a card after a pause that began during departure", () => {
    const result = runTimeline([
      ...every200(200, 6, () => cardRecord()),
      ...every200(1400, 3, () => emptySurfaceRecord()),
      ...every200(30_000, 3, () => darkFrame()),
      ...every200(30_600, 10, () => cardRecord()),
    ]);
    expect(result.photos).toBe(1);
  });

  it("requires a fresh hold after a pause during a hold", () => {
    const resumed = runTimeline([
      ...every200(200, 2, () => cardRecord()),
      { atMs: 10_000, record: cardRecord() },
    ]);
    expect(resumed.photos).toBe(0);
    expect(resumed.state.phase).toBe("seeking");
    const held = runTimeline([
      ...every200(200, 2, () => cardRecord()),
      ...every200(10_000, 4, () => cardRecord()),
    ]);
    expect(held.photos).toBe(1);
  });

  it("keeps the cooldown lock across a pause", () => {
    expect(
      resumeCaptureMachine({
        phase: "cooldown",
        holdStartedAt: 0,
        departureStartedAt: 500,
        captureLocked: true,
        captureInFlight: false,
      }),
    ).toEqual({
      phase: "cooldown",
      holdStartedAt: 0,
      departureStartedAt: null,
      captureLocked: true,
      captureInFlight: false,
    });
  });

  it("retries after a failed photo and stops after repeated failures", () => {
    expect(recoverFromCaptureFailure(1)).toEqual(initialCaptureMachineState());
    expect(recoverFromCaptureFailure(2)).toEqual(initialCaptureMachineState());
    expect(recoverFromCaptureFailure(3)).toEqual(failCapture());
  });
});

describe("stacked cards", () => {
  const cardWith = (seed: number, noise = 0) => ({
    ...cardRecord(),
    signature: cardSignature(seed).map((value, index) =>
      Math.max(0, Math.min(255, value + (noise ? ((index * 37) % 11) - 5 : 0))),
    ),
  });
  const handCovering = () => flickerRecord();

  it("photographs a new card that slides onto the last one", () => {
    const records = [
      ...Array.from({ length: 6 }, () => cardWith(1)),
      ...Array.from({ length: 3 }, () => handCovering()),
      ...Array.from({ length: 12 }, () => cardWith(2)),
      ...Array.from({ length: 3 }, () => handCovering()),
      ...Array.from({ length: 12 }, () => cardWith(3)),
    ];
    expect(runPresentation(records).photos).toBe(3);
  });

  it("does not retake the same card under brightness noise", () => {
    const records = [
      ...Array.from({ length: 6 }, () => cardWith(1)),
      ...Array.from({ length: 30 }, (_, index) => cardWith(1, index % 2)),
    ];
    expect(runPresentation(records).photos).toBe(1);
  });

  it("does not re-arm while a hand covers the card", () => {
    const records = [
      ...Array.from({ length: 6 }, () => cardWith(1)),
      ...Array.from({ length: 20 }, () => handCovering()),
      ...Array.from({ length: 6 }, () => cardWith(1)),
    ];
    expect(runPresentation(records).photos).toBe(1);
  });

  it("misses a second copy of the same card, which needs a departure", () => {
    const records = [
      ...Array.from({ length: 6 }, () => cardWith(1)),
      ...Array.from({ length: 3 }, () => handCovering()),
      ...Array.from({ length: 12 }, () => cardWith(1)),
    ];
    expect(runPresentation(records).photos).toBe(1);
  });

  it("scores different test cards well below the change threshold", () => {
    expect(
      signatureCorrelation(cardSignature(1), cardSignature(1)),
    ).toBeCloseTo(1, 5);
    expect(
      signatureCorrelation(cardSignature(1), cardSignature(2))!,
    ).toBeLessThan(0.8);
    expect(signatureCorrelation(cardSignature(1), [])).toBeNull();
  });
});

describe("card change under shared lighting", () => {
  const art = (seed: number) =>
    Array.from({ length: 48 }, (_, index) => {
      const value = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
      return (value - Math.floor(value) - 0.5) * 50;
    });
  const lit = (pattern: number[]) =>
    pattern.map((value, index) => {
      const column = index % 8;
      const row = Math.floor(index / 8);
      const hotspot = 70 * Math.exp(-((column - 4) ** 2 + (row - 2) ** 2) / 6);
      return Math.max(
        0,
        Math.min(255, 70 + 12 * column + 8 * row + hotspot + value),
      );
    });
  const pearson = (first: number[], second: number[]) => {
    const mean = (values: number[]) =>
      values.reduce((total, value) => total + value, 0) / values.length;
    const a = mean(first);
    const b = mean(second);
    let product = 0;
    let firstSquares = 0;
    let secondSquares = 0;
    first.forEach((value, index) => {
      product += (value - a) * (second[index]! - b);
      firstSquares += (value - a) ** 2;
      secondSquares += (second[index]! - b) ** 2;
    });
    return product / Math.sqrt(firstSquares * secondSquares);
  };

  it("tells different cards apart when the light pattern dominates brightness", () => {
    const first = lit(art(1));
    const second = lit(art(2));
    expect(pearson(first, second)).toBeGreaterThan(0.6);
    expect(signatureCorrelation(first, second)!).toBeLessThan(0.6);
    expect(signatureCorrelation(first, first)!).toBeCloseTo(1, 5);
  });

  it("scores a blank area as low texture and a card as high texture", () => {
    expect(signatureTexture(Array.from({ length: 48 }, () => 200))).toBe(0);
    expect(signatureTexture(cardSignature(1))!).toBeGreaterThan(20);
    expect(signatureTexture([1, 2, 3])).toBeNull();
  });
});

describe("learned background", () => {
  const withSignature = (signature: number[]) => ({
    ...cardRecord(),
    signature,
  });

  it("never photographs a learned background and still photographs a new card", () => {
    const background = cardSignature(5);
    let state: Parameters<typeof stepQuadCapture>[0] = {
      ...initialQuadCaptureState(),
      backgrounds: [background],
    };
    let photos = 0;
    const records = [
      ...Array.from({ length: 20 }, () => withSignature(background)),
      ...Array.from({ length: 6 }, () => withSignature(cardSignature(1))),
    ];
    records.forEach((raw, index) => {
      const observation = validateNativeRectangleRecord(raw)!;
      const step = stepQuadCapture(
        state,
        observation,
        observation.detected,
        720,
        1280,
        index * 200,
        QUAD_CAPTURE_TIMING,
      );
      state = { ...step.state, backgrounds: [background] };
      if (step.requestPhoto) {
        photos += 1;
        expect(index).toBeGreaterThanOrEqual(20);
        state = { ...state, machine: completeCapture(state.machine) };
      }
    });
    expect(photos).toBe(1);
  });
});

describe("capture commands from the JavaScript thread", () => {
  const capturing = {
    phase: "capturing" as const,
    holdStartedAt: 0,
    departureStartedAt: null,
    captureLocked: true,
    captureInFlight: true,
  };
  const base = {
    machine: capturing,
    guard: true,
    previousCorners: null,
    capturedSignature: cardSignature(1),
  };

  it("completes a photo once and ignores the same command again", () => {
    const first = applyCaptureCommands(
      base,
      { ...NO_CAPTURE_COMMANDS, photosDone: 1 },
      NO_APPLIED_CAPTURE_COMMANDS,
    );
    expect(first.state.machine.phase).toBe("cooldown");
    expect(first.state.capturedSignature).toEqual(cardSignature(1));
    const again = applyCaptureCommands(
      first.state,
      { ...NO_CAPTURE_COMMANDS, photosDone: 1 },
      first.applied,
    );
    expect(again.state.machine).toEqual(first.state.machine);
  });

  it("re-arms after a background photo only from cooldown", () => {
    const cooldown = { ...base, machine: completeCapture(capturing) };
    expect(
      applyCaptureCommands(
        cooldown,
        { ...NO_CAPTURE_COMMANDS, rearms: 1 },
        NO_APPLIED_CAPTURE_COMMANDS,
      ).state.machine,
    ).toEqual(initialCaptureMachineState());
    expect(
      applyCaptureCommands(
        base,
        { ...NO_CAPTURE_COMMANDS, rearms: 1 },
        NO_APPLIED_CAPTURE_COMMANDS,
      ).state.machine.phase,
    ).toBe("capturing");
  });

  it("resets the round and retries or stops after failures", () => {
    const reset = applyCaptureCommands(
      base,
      { ...NO_CAPTURE_COMMANDS, resets: 1 },
      NO_APPLIED_CAPTURE_COMMANDS,
    );
    expect(reset.state).toMatchObject({
      machine: initialCaptureMachineState(),
      guard: false,
      capturedSignature: null,
    });
    expect(
      applyCaptureCommands(
        base,
        { ...NO_CAPTURE_COMMANDS, photosFailed: 1, failureStreak: 1 },
        NO_APPLIED_CAPTURE_COMMANDS,
      ).state.machine,
    ).toEqual(initialCaptureMachineState());
    expect(
      applyCaptureCommands(
        base,
        { ...NO_CAPTURE_COMMANDS, photosFailed: 3, failureStreak: 3 },
        NO_APPLIED_CAPTURE_COMMANDS,
      ).state.machine,
    ).toEqual(failCapture());
  });

  it("keeps photographing stacked cards when photos finish between samples", () => {
    const cardWith = (seed: number) => ({
      ...cardRecord(),
      signature: cardSignature(seed),
    });
    const records = [
      ...Array.from({ length: 8 }, () => cardWith(1)),
      ...Array.from({ length: 2 }, () => flickerRecord()),
      ...Array.from({ length: 12 }, () => cardWith(2)),
      ...Array.from({ length: 2 }, () => flickerRecord()),
      ...Array.from({ length: 12 }, () => cardWith(3)),
    ];
    let state: Parameters<typeof stepQuadCapture>[0] =
      initialQuadCaptureState();
    let commands = NO_CAPTURE_COMMANDS;
    let applied = NO_APPLIED_CAPTURE_COMMANDS;
    const pending: number[] = [];
    let photos = 0;
    records.forEach((raw, index) => {
      while (pending.length > 0 && pending[0]! <= index) {
        pending.shift();
        commands = { ...commands, photosDone: commands.photosDone + 1 };
      }
      const commanded = applyCaptureCommands(state, commands, applied);
      applied = commanded.applied;
      const observation = validateNativeRectangleRecord(raw)!;
      const step = stepQuadCapture(
        commanded.state,
        observation,
        observation.detected,
        720,
        1280,
        index * 200,
        QUAD_CAPTURE_TIMING,
      );
      state = step.state;
      if (step.requestPhoto) {
        photos += 1;
        pending.push(index + 2);
      }
    });
    expect(photos).toBe(3);
    expect(state.machine.phase).toBe("cooldown");
  });
});

describe("stuck capture watchdog", () => {
  const capturing = {
    phase: "capturing" as const,
    holdStartedAt: 1000,
    departureStartedAt: null,
    captureLocked: true,
    captureInFlight: true,
  };
  const base = {
    machine: capturing,
    guard: true,
    previousCorners: null,
    capturedSignature: cardSignature(1),
  };

  it("recovers a capture that has no photo in flight", () => {
    const result = applyCaptureCommands(
      base,
      NO_CAPTURE_COMMANDS,
      NO_APPLIED_CAPTURE_COMMANDS,
      1000 + 400 + 3001,
      false,
      400,
    );
    expect(result.watchdogFired).toBe(true);
    expect(result.state.machine).toEqual(initialCaptureMachineState());
  });

  it("leaves a slow photo that is still in flight alone", () => {
    const result = applyCaptureCommands(
      base,
      NO_CAPTURE_COMMANDS,
      NO_APPLIED_CAPTURE_COMMANDS,
      1000 + 400 + 10000,
      true,
      400,
    );
    expect(result.watchdogFired).toBe(false);
    expect(result.state.machine.phase).toBe("capturing");
  });

  it("waits for the stuck limit before recovering", () => {
    expect(
      applyCaptureCommands(
        base,
        NO_CAPTURE_COMMANDS,
        NO_APPLIED_CAPTURE_COMMANDS,
        1000 + 400 + 2000,
        false,
        400,
      ).watchdogFired,
    ).toBe(false);
  });
});

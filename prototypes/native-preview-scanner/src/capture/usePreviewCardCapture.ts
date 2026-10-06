import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import {
  runAtTargetFps,
  useFrameProcessor,
  type Camera,
} from "react-native-vision-camera";
import { Worklets, useSharedValue } from "react-native-worklets-core";
import {
  AUTOMATIC_CAPTURE_ENABLED,
  DETECTOR_THRESHOLDS,
  QUAD_CAPTURE_TIMING,
  type CaptureThresholds,
} from "./config";
import type { PreviewGates } from "./metrics";
import {
  EMPTY_TIMING_TELEMETRY,
  recordAnalysisSample,
  type AnalysisTelemetry,
} from "./timingTelemetry";
import {
  advanceCaptureMachine,
  completeCapture,
  failCapture,
  initialCaptureMachineState,
  manualResetCaptureMachine,
  type CapturePhase,
} from "./stateMachine";
import {
  evaluateQuadCaptureGates,
  quadMotion,
  refinedCorners,
  type QuadCorners,
} from "./quadCaptureGates";
import { callNativeRectangleDetector } from "../detector/nativeRectangleDetector";
import {
  orientedFrameDimensions,
  validateNativeRectangleRecord,
  type NativeRectangleRecord,
} from "../detector/validation";

export type CapturedPhoto = { width: number; height: number };

export type DetectorGates = {
  detected: boolean;
  confidence: boolean;
  area: boolean;
  aspect: boolean;
  edges: boolean;
  all: boolean;
};

export type PreviewCardCaptureDiagnostics = {
  phase: CapturePhase;
  observation: NativeRectangleRecord;
  gates: DetectorGates;
  captureGates: PreviewGates;
  motion: number | null;
  timing: AnalysisTelemetry;
  captureLocked: boolean;
  sampleId: number;
  sampleWallAtMs: number;
  frameWidth: number;
  frameHeight: number;
  orientedFrameWidth: number;
  orientedFrameHeight: number;
  consecutiveSlowSamples: number;
  fatalErrorCode: number;
};

type PublishedDiagnostics = Omit<
  PreviewCardCaptureDiagnostics,
  "timing" | "consecutiveSlowSamples" | "fatalErrorCode"
>;

type PublishedTiming = {
  sampleId: number;
  sampleWallAtMs: number;
  totalDurationMs: number;
  consecutiveSlowSamples: number;
  fatalErrorCode: number;
};

export type PreviewCardCapture = {
  frameProcessor: ReturnType<typeof useFrameProcessor>;
  diagnostics: PreviewCardCaptureDiagnostics;
  lastPhoto: CapturedPhoto | null;
  photoCount: number;
  error: string | null;
  thresholds: CaptureThresholds;
  reset: () => void;
  reportFatalCameraError: () => void;
};

const EMPTY_OBSERVATION: NativeRectangleRecord = {
  detected: false,
  topLeft: null,
  topRight: null,
  bottomRight: null,
  bottomLeft: null,
  proposalDetected: false,
  proposalTopLeft: null,
  proposalTopRight: null,
  proposalBottomRight: null,
  proposalBottomLeft: null,
  confidence: 0,
  areaRatio: 0,
  aspectRatio: 0,
  centerOffset: 1,
  edgeSupportMin: 0,
  shiftTop: 0,
  shiftRight: 0,
  shiftBottom: 0,
  shiftLeft: 0,
  refinementStatus: 1,
  proposalDurationMs: 0,
  nativeDurationMs: 0,
  orientationCode: -1,
  runtimeErrorCode: 0,
};

const EMPTY_GATES: DetectorGates = {
  detected: false,
  confidence: false,
  area: false,
  aspect: false,
  edges: false,
  all: false,
};

const EMPTY_CAPTURE_GATES: PreviewGates = {
  present: false,
  centered: false,
  sharp: false,
  stable: false,
  departed: true,
  all: false,
};

const initialDiagnostics = (): PreviewCardCaptureDiagnostics => ({
  phase: "seeking",
  observation: EMPTY_OBSERVATION,
  gates: EMPTY_GATES,
  captureGates: EMPTY_CAPTURE_GATES,
  motion: null,
  timing: EMPTY_TIMING_TELEMETRY,
  captureLocked: false,
  sampleId: 0,
  sampleWallAtMs: 0,
  frameWidth: 0,
  frameHeight: 0,
  orientedFrameWidth: 0,
  orientedFrameHeight: 0,
  consecutiveSlowSamples: 0,
  fatalErrorCode: 0,
});

const evaluateDetectorGates = (
  observation: NativeRectangleRecord,
): DetectorGates => {
  "worklet";
  const detected = observation.detected;
  const confidence =
    detected && observation.confidence >= DETECTOR_THRESHOLDS.confidenceMin;
  const area =
    detected &&
    observation.areaRatio >= DETECTOR_THRESHOLDS.areaRatioMin &&
    observation.areaRatio <= DETECTOR_THRESHOLDS.areaRatioMax;
  const aspect =
    detected &&
    observation.aspectRatio >= DETECTOR_THRESHOLDS.aspectRatioMin &&
    observation.aspectRatio <= DETECTOR_THRESHOLDS.aspectRatioMax;
  const edges =
    detected &&
    observation.edgeSupportMin >= DETECTOR_THRESHOLDS.edgeSupportMin;
  return {
    detected,
    confidence,
    area,
    aspect,
    edges,
    all: detected && confidence && area && aspect && edges,
  };
};

const roundScalar = (value: number, digits = 4) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

export function usePreviewCardCapture(
  camera: RefObject<Camera | null>,
  thresholds: CaptureThresholds = QUAD_CAPTURE_TIMING,
): PreviewCardCapture {
  const machine = useSharedValue(initialCaptureMachineState());
  const workletCaptureGuard = useSharedValue(false);
  const fatalDetector = useSharedValue(false);
  const consecutiveSlowSamples = useSharedValue(0);
  const previousSampleWallAtMs = useSharedValue(0);
  const sampleSequence = useSharedValue(0);
  const previousCorners = useSharedValue<QuadCorners | null>(null);
  const jsCaptureGuard = useRef(false);
  const fatalDetectorOnJS = useRef(false);
  const timingHistory = useRef<number[]>([]);
  const timestampHistory = useRef<number[]>([]);
  const runSamples = useRef(0);
  const captureSequence = useRef(0);
  const lastPublished = useRef<PublishedDiagnostics | null>(null);
  const [lastPhoto, setLastPhoto] = useState<CapturedPhoto | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState(initialDiagnostics);

  const receiveDiagnostics = useCallback((next: PublishedDiagnostics) => {
    if (fatalDetectorOnJS.current) return;
    lastPublished.current = next;
    if (!next.captureLocked) jsCaptureGuard.current = false;
    setDiagnostics((current) => ({
      ...current,
      ...next,
    }));
  }, []);
  const publishDiagnostics = useMemo(
    () => Worklets.createRunOnJS(receiveDiagnostics),
    [receiveDiagnostics],
  );

  const stopDetectorOnJS = useCallback(
    (code: number, atMs: number) => {
      if (code === 0 || fatalDetectorOnJS.current) return;
      fatalDetectorOnJS.current = true;
      fatalDetector.value = true;
      machine.value = failCapture();
      workletCaptureGuard.value = true;
      jsCaptureGuard.current = true;
      setError(`Detector stopped for this session (code ${code}).`);
      setDiagnostics((current) => ({
        ...current,
        phase: "error",
        captureLocked: true,
        fatalErrorCode: code,
      }));
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({ event: "fatal-detector-stop", atMs, code }),
      );
    },
    [fatalDetector, machine, workletCaptureGuard],
  );
  const publishFatal = useMemo(
    () => Worklets.createRunOnJS(stopDetectorOnJS),
    [stopDetectorOnJS],
  );

  const receiveTiming = useCallback(
    (next: PublishedTiming) => {
      if (fatalDetectorOnJS.current) return;
      const timing = recordAnalysisSample(
        timingHistory.current,
        timestampHistory.current,
        next.totalDurationMs,
        next.sampleWallAtMs,
      );
      const sampleCount = ++runSamples.current;
      setDiagnostics((current) => ({
        ...current,
        timing,
        consecutiveSlowSamples: next.consecutiveSlowSamples,
        fatalErrorCode: next.fatalErrorCode,
      }));

      const published = lastPublished.current;
      if (sampleCount % 25 === 0 && published?.sampleId === next.sampleId) {
        const observation = published.observation;
        console.log(
          "NATIVE_PREVIEW_TELEMETRY " +
            JSON.stringify({
              runSamples: sampleCount,
              sampleId: next.sampleId,
              sampleWallAtMs: next.sampleWallAtMs,
              totalDurationMs: roundScalar(next.totalDurationMs),
              nativeDurationMs: roundScalar(observation.nativeDurationMs),
              sampleCount: timing.sampleCount,
              p50Ms: roundScalar(timing.p50Ms),
              p95Ms: roundScalar(timing.p95Ms),
              maxMs: roundScalar(timing.maxMs),
              elapsedSpanMs: roundScalar(timing.elapsedSpanMs),
              effectiveHz: roundScalar(timing.effectiveHz),
              maxGapMs: roundScalar(timing.maxGapMs),
              cadencePass: timing.cadencePass,
              consecutiveSlowSamples: next.consecutiveSlowSamples,
              detected: observation.detected,
              topLeft: observation.topLeft,
              topRight: observation.topRight,
              bottomRight: observation.bottomRight,
              bottomLeft: observation.bottomLeft,
              proposalDetected: observation.proposalDetected,
              proposalTopLeft: observation.proposalTopLeft,
              proposalTopRight: observation.proposalTopRight,
              proposalBottomRight: observation.proposalBottomRight,
              proposalBottomLeft: observation.proposalBottomLeft,
              confidence: roundScalar(observation.confidence),
              areaRatio: roundScalar(observation.areaRatio),
              aspectRatio: roundScalar(observation.aspectRatio),
              centerOffset: roundScalar(observation.centerOffset),
              edgeSupportMin: roundScalar(observation.edgeSupportMin),
              shiftTop: roundScalar(observation.shiftTop),
              shiftRight: roundScalar(observation.shiftRight),
              shiftBottom: roundScalar(observation.shiftBottom),
              shiftLeft: roundScalar(observation.shiftLeft),
              refinementStatus: observation.refinementStatus,
              proposalDurationMs: roundScalar(observation.proposalDurationMs),
              orientationCode: observation.orientationCode,
              runtimeErrorCode: observation.runtimeErrorCode,
              frameWidth: published.frameWidth,
              frameHeight: published.frameHeight,
              orientedFrameWidth: published.orientedFrameWidth,
              orientedFrameHeight: published.orientedFrameHeight,
              gates: published.gates,
              phase: published.phase,
              captureGates: published.captureGates,
              motion:
                published.motion === null
                  ? null
                  : roundScalar(published.motion),
              automaticCaptureEnabled: AUTOMATIC_CAPTURE_ENABLED,
            }),
        );
      }
      if (next.fatalErrorCode !== 0) {
        stopDetectorOnJS(next.fatalErrorCode, Date.now());
      }
    },
    [stopDetectorOnJS],
  );
  const publishTiming = useMemo(
    () => Worklets.createRunOnJS(receiveTiming),
    [receiveTiming],
  );

  const takeExactlyOnePhoto = useCallback(async () => {
    if (jsCaptureGuard.current || fatalDetectorOnJS.current) return;
    jsCaptureGuard.current = true;
    const sequence = ++captureSequence.current;
    console.log(
      "NATIVE_PREVIEW_EVENT " +
        JSON.stringify({
          event: "capture-js-start",
          atMs: Date.now(),
          sequence,
        }),
    );
    setError(null);
    setDiagnostics((current) => ({ ...current, phase: "capturing" }));
    try {
      if (camera.current === null) throw new Error("camera-not-ready");
      const photo = await camera.current.takePhoto({ flash: "off" });
      setLastPhoto({ width: photo.width, height: photo.height });
      setPhotoCount((count) => count + 1);
      const machineBeforeComplete = machine.value;
      const machineAfterComplete = completeCapture(machineBeforeComplete);
      machine.value = machineAfterComplete;
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "capture-success",
            atMs: Date.now(),
            sequence,
            width: photo.width,
            height: photo.height,
            beforePhase: machineBeforeComplete.phase,
            beforeLocked: machineBeforeComplete.captureLocked,
            beforeInFlight: machineBeforeComplete.captureInFlight,
            afterPhase: machineAfterComplete.phase,
            afterLocked: machineAfterComplete.captureLocked,
            afterInFlight: machineAfterComplete.captureInFlight,
          }),
      );
      setDiagnostics((current) => ({
        ...current,
        phase: "cooldown",
        captureLocked: true,
      }));
    } catch {
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "capture-failure",
            atMs: Date.now(),
            sequence,
            code: 1,
          }),
      );
      machine.value = failCapture();
      setError("Capture failed.");
      setDiagnostics((current) => ({
        ...current,
        phase: "error",
        captureLocked: true,
      }));
    }
  }, [camera, machine]);
  const requestPhotoOnJS = useMemo(
    () => Worklets.createRunOnJS(takeExactlyOnePhoto),
    [takeExactlyOnePhoto],
  );

  const frameProcessor = useFrameProcessor(
    (frame) => {
      "worklet";
      if (fatalDetector.value) return;
      runAtTargetFps(5, () => {
        "worklet";
        if (fatalDetector.value) return;
        const startedAt = performance.now();
        const sampleWallAtMs = Date.now();
        if (
          !Number.isFinite(sampleWallAtMs) ||
          sampleWallAtMs < 0 ||
          (previousSampleWallAtMs.value > 0 &&
            sampleWallAtMs <= previousSampleWallAtMs.value)
        ) {
          fatalDetector.value = true;
          workletCaptureGuard.value = true;
          try {
            publishFatal(33, 0);
          } catch {}
          return;
        }
        previousSampleWallAtMs.value = sampleWallAtMs;
        const sampleId = sampleSequence.value + 1;
        sampleSequence.value = sampleId;

        let raw: unknown | null;
        try {
          raw = callNativeRectangleDetector(frame);
        } catch {
          fatalDetector.value = true;
          workletCaptureGuard.value = true;
          try {
            publishFatal(12, sampleWallAtMs);
          } catch {}
          return;
        }
        if (raw === null) {
          fatalDetector.value = true;
          workletCaptureGuard.value = true;
          try {
            publishFatal(10, sampleWallAtMs);
          } catch {}
          return;
        }
        const observation = validateNativeRectangleRecord(raw);
        if (observation === null) {
          fatalDetector.value = true;
          workletCaptureGuard.value = true;
          try {
            publishFatal(20, sampleWallAtMs);
          } catch {}
          return;
        }
        const mappedOrientedDimensions = orientedFrameDimensions(
          frame.width,
          frame.height,
          observation.orientationCode,
        );
        if (
          mappedOrientedDimensions === null &&
          observation.runtimeErrorCode === 0
        ) {
          fatalDetector.value = true;
          workletCaptureGuard.value = true;
          try {
            publishFatal(21, sampleWallAtMs);
          } catch {}
          return;
        }
        const orientedDimensions = mappedOrientedDimensions ?? {
          width: 0,
          height: 0,
        };

        const gates = evaluateDetectorGates(observation);
        const corners = refinedCorners(
          observation,
          orientedDimensions.width,
          orientedDimensions.height,
        );
        const motion = quadMotion(previousCorners.value, corners);
        previousCorners.value = corners;
        const captureGates = evaluateQuadCaptureGates(
          observation,
          gates.all,
          motion,
        );
        let phase = machine.value.phase;
        let captureLocked = machine.value.captureLocked;
        let requestCapture = false;
        if (AUTOMATIC_CAPTURE_ENABLED) {
          const transition = advanceCaptureMachine(
            machine.value,
            captureGates,
            performance.now(),
            thresholds,
          );
          machine.value = transition.state;
          phase = transition.state.phase;
          captureLocked = transition.state.captureLocked;
          requestCapture = transition.requestCapture;
        }

        try {
          publishDiagnostics({
            phase,
            observation,
            gates,
            captureGates,
            motion,
            captureLocked,
            sampleId,
            sampleWallAtMs,
            frameWidth: frame.width,
            frameHeight: frame.height,
            orientedFrameWidth: orientedDimensions.width,
            orientedFrameHeight: orientedDimensions.height,
          });
        } catch {
          fatalDetector.value = true;
          workletCaptureGuard.value = true;
          try {
            publishFatal(30, sampleWallAtMs);
          } catch {}
          return;
        }

        const totalDurationMs = performance.now() - startedAt;
        if (!Number.isFinite(totalDurationMs) || totalDurationMs < 0) {
          fatalDetector.value = true;
          workletCaptureGuard.value = true;
          try {
            publishFatal(31, sampleWallAtMs);
          } catch {}
          return;
        }
        const slowStreak =
          totalDurationMs > 100 ? consecutiveSlowSamples.value + 1 : 0;
        consecutiveSlowSamples.value = slowStreak;
        const nativeFatalCode =
          observation.runtimeErrorCode === 0
            ? 0
            : 100 + observation.runtimeErrorCode;
        const fatalErrorCode = slowStreak >= 10 ? 50 : nativeFatalCode;
        try {
          publishTiming({
            sampleId,
            sampleWallAtMs,
            totalDurationMs,
            consecutiveSlowSamples: slowStreak,
            fatalErrorCode,
          });
        } catch {
          fatalDetector.value = true;
          workletCaptureGuard.value = true;
          try {
            publishFatal(32, sampleWallAtMs);
          } catch {}
          return;
        }

        if (fatalErrorCode !== 0) {
          fatalDetector.value = true;
          workletCaptureGuard.value = true;
          return;
        }
        if (requestCapture && !workletCaptureGuard.value) {
          workletCaptureGuard.value = true;
          requestPhotoOnJS();
        }
      });
    },
    [
      consecutiveSlowSamples,
      fatalDetector,
      machine,
      publishDiagnostics,
      publishFatal,
      publishTiming,
      previousCorners,
      previousSampleWallAtMs,
      requestPhotoOnJS,
      sampleSequence,
      thresholds,
      workletCaptureGuard,
    ],
  );

  const reportFatalCameraError = useCallback(() => {
    stopDetectorOnJS(40, Date.now());
  }, [stopDetectorOnJS]);

  const reset = useCallback(() => {
    if (fatalDetectorOnJS.current || fatalDetector.value) {
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "manual-reset-ignored-fatal",
            atMs: Date.now(),
            code: diagnostics.fatalErrorCode,
          }),
      );
      return;
    }
    const resetState = manualResetCaptureMachine(machine.value);
    if (resetState === machine.value) {
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "manual-reset-ignored-capture-in-flight",
            atMs: Date.now(),
          }),
      );
      return;
    }
    console.log(
      "NATIVE_PREVIEW_EVENT " +
        JSON.stringify({ event: "manual-reset-accepted", atMs: Date.now() }),
    );
    machine.value = resetState;
    workletCaptureGuard.value = false;
    jsCaptureGuard.current = false;
    setLastPhoto(null);
    setPhotoCount(0);
    previousCorners.value = null;
    setError(null);
    setDiagnostics(initialDiagnostics());
    timingHistory.current = [];
    timestampHistory.current = [];
    runSamples.current = 0;
    lastPublished.current = null;
    consecutiveSlowSamples.value = 0;
    previousSampleWallAtMs.value = 0;
  }, [
    consecutiveSlowSamples,
    diagnostics.fatalErrorCode,
    fatalDetector,
    machine,
    previousCorners,
    previousSampleWallAtMs,
    workletCaptureGuard,
  ]);

  return {
    frameProcessor,
    diagnostics,
    lastPhoto,
    photoCount,
    error,
    thresholds,
    reset,
    reportFatalCameraError,
  };
}

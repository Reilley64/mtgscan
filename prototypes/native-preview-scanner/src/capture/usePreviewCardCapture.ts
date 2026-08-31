import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import {
  runAtTargetFps,
  useFrameProcessor,
  type Camera,
  type PhotoFile,
} from "react-native-vision-camera";
import { Worklets, useSharedValue } from "react-native-worklets-core";
import { useResizePlugin } from "vision-camera-resize-plugin";
import {
  ANALYSIS_MARGIN_FRACTION,
  ANALYSIS_SHORT_EDGE,
  CARD_ASPECT_RATIO,
  DEFAULT_CAPTURE_THRESHOLDS,
  GUIDE_WIDTH_FRACTION,
  type CaptureThresholds,
} from "./config";
import {
  computePreviewMetrics,
  evaluatePreviewGates,
  type PreviewGates,
  type PreviewMetrics,
} from "./metrics";
import {
  EMPTY_TIMING_TELEMETRY,
  recordProcessingTime,
  type TimingTelemetry,
} from "./timingTelemetry";
import {
  advanceCaptureMachine,
  completeCapture,
  failCapture,
  initialCaptureMachineState,
  manualResetCaptureMachine,
  type CapturePhase,
} from "./stateMachine";

export type CapturedPhoto = Pick<PhotoFile, "width" | "height" | "path">;

export type PreviewCardCaptureDiagnostics = {
  phase: CapturePhase;
  metrics: PreviewMetrics;
  gates: PreviewGates;
  timing: TimingTelemetry;
  captureLocked: boolean;
};

type PublishedPreviewCardCaptureDiagnostics = Omit<
  PreviewCardCaptureDiagnostics,
  "timing"
>;

export type PreviewCardCapture = {
  frameProcessor: ReturnType<typeof useFrameProcessor>;
  diagnostics: PreviewCardCaptureDiagnostics;
  lastPhoto: CapturedPhoto | null;
  error: string | null;
  thresholds: CaptureThresholds;
  reset: () => void;
  reportError: (message: string) => void;
};

const EMPTY_METRICS: PreviewMetrics = {
  borderEnergy: 0,
  borderContinuity: 0,
  centerScore: 0,
  interiorVariance: 0,
  sharpness: 0,
  motion: 255,
  processingMs: 0,
};

const EMPTY_GATES: PreviewGates = {
  present: false,
  centered: false,
  sharp: false,
  stable: false,
  departed: true,
  all: false,
};

export function usePreviewCardCapture(
  camera: RefObject<Camera | null>,
  thresholds: CaptureThresholds = DEFAULT_CAPTURE_THRESHOLDS,
): PreviewCardCapture {
  const { resize } = useResizePlugin();
  const machine = useSharedValue(initialCaptureMachineState());
  const previousSignature = useSharedValue<number[] | null>(null);
  const workletCaptureGuard = useSharedValue(false);
  const jsCaptureGuard = useRef(false);
  const timingHistory = useRef<number[]>([]);
  const runSamples = useRef(0);
  const captureSequence = useRef(0);
  const [lastPhoto, setLastPhoto] = useState<CapturedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<PreviewCardCaptureDiagnostics>(
    {
      phase: "seeking",
      metrics: EMPTY_METRICS,
      gates: EMPTY_GATES,
      timing: EMPTY_TIMING_TELEMETRY,
      captureLocked: false,
    },
  );

  const receiveDiagnostics = useCallback(
    (next: PublishedPreviewCardCaptureDiagnostics) => {
      if (!next.captureLocked) jsCaptureGuard.current = false;
      const timing = recordProcessingTime(
        timingHistory.current,
        next.metrics.processingMs,
      );
      const sampleCount = ++runSamples.current;
      setDiagnostics({ ...next, timing });
      if (sampleCount % 25 === 0) {
        console.log(
          "NATIVE_PREVIEW_TELEMETRY " +
            JSON.stringify({
              runSamples: sampleCount,
              processingMs: next.metrics.processingMs,
              timing,
              phase: next.phase,
              gates: next.gates,
              metrics: next.metrics,
            }),
        );
      }
    },
    [],
  );
  const publishDiagnostics = useMemo(
    () => Worklets.createRunOnJS(receiveDiagnostics),
    [receiveDiagnostics],
  );

  const takeExactlyOnePhoto = useCallback(async () => {
    if (jsCaptureGuard.current) return;
    jsCaptureGuard.current = true;
    const sequence = ++captureSequence.current;
    console.log(
      "NATIVE_PREVIEW_EVENT " +
        JSON.stringify({ event: "capture-js-start", sequence }),
    );
    setError(null);
    setDiagnostics((current) => ({ ...current, phase: "capturing" }));
    try {
      if (camera.current === null) throw new Error("Camera is not ready.");
      const photo = await camera.current.takePhoto({ flash: "off" });
      setLastPhoto({
        width: photo.width,
        height: photo.height,
        path: photo.path,
      });
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "capture-success",
            sequence,
            width: photo.width,
            height: photo.height,
          }),
      );
      machine.value = completeCapture(machine.value);
      setDiagnostics((current) => ({
        ...current,
        phase: "cooldown",
        captureLocked: true,
      }));
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "capture-failure",
            sequence,
            error: "capture-failed",
          }),
      );
      machine.value = failCapture();
      setError(message);
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
      runAtTargetFps(5, () => {
        "worklet";
        const startedAt = performance.now();
        const rawShortEdge = Math.min(frame.width, frame.height);
        let cropShortEdge =
          rawShortEdge * GUIDE_WIDTH_FRACTION * (1 + ANALYSIS_MARGIN_FRACTION);
        let cropLongEdge = cropShortEdge / CARD_ASPECT_RATIO;
        const availableLongEdge = Math.max(frame.width, frame.height);
        if (cropLongEdge > availableLongEdge) {
          const fit = availableLongEdge / cropLongEdge;
          cropShortEdge *= fit;
          cropLongEdge *= fit;
        }
        const landscapeBuffer = frame.width > frame.height;
        const cropWidth = landscapeBuffer ? cropLongEdge : cropShortEdge;
        const cropHeight = landscapeBuffer ? cropShortEdge : cropLongEdge;
        const outputWidth = landscapeBuffer
          ? Math.round(ANALYSIS_SHORT_EDGE / CARD_ASPECT_RATIO)
          : ANALYSIS_SHORT_EDGE;
        const outputHeight = landscapeBuffer
          ? ANALYSIS_SHORT_EDGE
          : Math.round(ANALYSIS_SHORT_EDGE / CARD_ASPECT_RATIO);
        const pixels = resize(frame, {
          crop: {
            x: Math.round((frame.width - cropWidth) / 2),
            y: Math.round((frame.height - cropHeight) / 2),
            width: Math.round(cropWidth),
            height: Math.round(cropHeight),
          },
          scale: { width: outputWidth, height: outputHeight },
          pixelFormat: "argb",
          dataType: "uint8",
        });
        const result = computePreviewMetrics(
          pixels,
          outputWidth,
          outputHeight,
          4,
          previousSignature.value,
        );
        previousSignature.value = result.signature;
        result.metrics.processingMs = performance.now() - startedAt;
        const gates = evaluatePreviewGates(result.metrics, thresholds);
        const transition = advanceCaptureMachine(
          machine.value,
          gates,
          performance.now(),
          thresholds,
        );
        machine.value = transition.state;
        if (!transition.state.captureLocked) workletCaptureGuard.value = false;
        publishDiagnostics({
          phase: transition.state.phase,
          metrics: result.metrics,
          gates,
          captureLocked: transition.state.captureLocked,
        });
        if (transition.requestCapture && !workletCaptureGuard.value) {
          workletCaptureGuard.value = true;
          requestPhotoOnJS();
        }
      });
    },
    [
      machine,
      previousSignature,
      publishDiagnostics,
      requestPhotoOnJS,
      resize,
      thresholds,
      workletCaptureGuard,
    ],
  );

  const reportError = useCallback(
    (message: string) => {
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "camera-runtime-error",
            error: "camera-runtime-error",
          }),
      );
      setError(message);
      if (machine.value.captureInFlight) return;
      machine.value = failCapture();
      workletCaptureGuard.value = true;
      jsCaptureGuard.current = true;
      setDiagnostics((current) => ({
        ...current,
        phase: "error",
        captureLocked: true,
      }));
    },
    [machine, workletCaptureGuard],
  );

  const reset = useCallback(() => {
    const resetState = manualResetCaptureMachine(machine.value);
    if (resetState === machine.value) {
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({ event: "manual-reset-ignored-capture-in-flight" }),
      );
      return;
    }
    console.log(
      "NATIVE_PREVIEW_EVENT " +
        JSON.stringify({ event: "manual-reset-accepted" }),
    );
    machine.value = resetState;
    previousSignature.value = null;
    workletCaptureGuard.value = false;
    jsCaptureGuard.current = false;
    setLastPhoto(null);
    setError(null);
    setDiagnostics({
      phase: "seeking",
      metrics: EMPTY_METRICS,
      gates: EMPTY_GATES,
      timing: EMPTY_TIMING_TELEMETRY,
      captureLocked: false,
    });
    timingHistory.current = [];
    runSamples.current = 0;
  }, [machine, previousSignature, workletCaptureGuard]);

  return {
    frameProcessor,
    diagnostics,
    lastPhoto,
    error,
    thresholds,
    reset,
    reportError,
  };
}

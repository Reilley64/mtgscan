import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import {
  runAtTargetFps,
  useFrameProcessor,
  type Camera,
  type CameraRuntimeError,
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
  failCapture,
  initialCaptureMachineState,
  recoverFromCaptureFailure,
  resumeCaptureMachine,
  RESUME_GAP_MS,
  type CapturePhase,
} from "./stateMachine";
import {
  rawSignatureCorrelation,
  signatureTexture,
  type QuadCorners,
} from "./quadCaptureGates";
import {
  applyCaptureCommands,
  NO_APPLIED_CAPTURE_COMMANDS,
  NO_CAPTURE_COMMANDS,
  stepQuadCapture,
  type AppliedCaptureCommands,
  type CaptureCommands,
} from "./quadCaptureStep";
import { callNativeRectangleDetector } from "../detector/nativeRectangleDetector";
import {
  isNotACard,
  recognitionConfig,
  recognizePhoto,
  type CardQuad,
  type RecognitionResult,
} from "../recognition/recognitionClient";
import {
  prepareDeviceRecognizer,
  recognizeOnDevice,
} from "../recognition/deviceRecognizer";
import {
  orientedFrameDimensions,
  validateNativeRectangleRecord,
  type NativeRectangleRecord,
} from "../detector/validation";

export type CapturedPhoto = { width: number; height: number };

export type RecognitionView =
  | { status: "pending"; sequence: number }
  | {
      status: "done";
      sequence: number;
      endToEndMs: number;
      result: RecognitionResult;
    }
  | { status: "failed"; sequence: number; message: string };

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
  changeCorrelation: number | null;
  rawChangeCorrelation: number | null;
  background: boolean;
  signatureTexture: number | null;
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

const CAMERA_ERROR_WINDOW_MS = 30_000;
const CAMERA_ERROR_LIMIT = 3;

type PublishedDiagnostics = Omit<
  PreviewCardCaptureDiagnostics,
  "timing" | "consecutiveSlowSamples" | "fatalErrorCode"
> & {
  resumedAfterGapMs: number;
  rearmReason: string | null;
  photosDoneApplied: number;
  watchdogFired: boolean;
  photoRequested: boolean;
};

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
  photoInFlight: boolean;
  recognitionEnabled: boolean;
  lastRecognition: RecognitionView | null;
  recognitions: RecognitionView[];
  error: string | null;
  thresholds: CaptureThresholds;
  reset: () => void;
  reportCameraError: (error: CameraRuntimeError) => void;
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
  signature: [],
  edgeSupports: [],
  fallbackEdges: 0,
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
  changeCorrelation: null,
  rawChangeCorrelation: null,
  background: false,
  signatureTexture: null,
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
  torchOn = false,
): PreviewCardCapture {
  const torchRef = useRef(torchOn);
  torchRef.current = torchOn;
  const machine = useSharedValue(initialCaptureMachineState());
  const workletCaptureGuard = useSharedValue(false);
  const fatalDetector = useSharedValue(false);
  const consecutiveSlowSamples = useSharedValue(0);
  const previousSampleWallAtMs = useSharedValue(0);
  const sampleSequence = useSharedValue(0);
  const previousCorners = useSharedValue<QuadCorners | null>(null);
  const capturedSignature = useSharedValue<number[] | null>(null);
  const backgroundSignatures = useSharedValue<number[][]>([]);
  const captureCommands = useSharedValue<CaptureCommands>(NO_CAPTURE_COMMANDS);
  const appliedCaptureCommands = useSharedValue<AppliedCaptureCommands>(
    NO_APPLIED_CAPTURE_COMMANDS,
  );
  const photoInFlight = useSharedValue(0);
  const [photoInFlightOnJS, setPhotoInFlightOnJS] = useState(false);
  const jsCaptureGuard = useRef(false);
  const fatalDetectorOnJS = useRef(false);
  const timingHistory = useRef<number[]>([]);
  const timestampHistory = useRef<number[]>([]);
  const runSamples = useRef(0);
  const captureSequence = useRef(0);
  const consecutiveCaptureFailures = useRef(0);
  const recognitionQueue = useRef<Promise<void>>(Promise.resolve());
  const recognitionSessionId = useRef(Date.now().toString(36));
  const recognition = useMemo(recognitionConfig, []);
  useEffect(() => {
    if (recognition?.mode === "device")
      prepareDeviceRecognizer(recognition).catch(() => undefined);
  }, [recognition]);
  const [lastRecognition, setLastRecognition] =
    useState<RecognitionView | null>(null);
  const [recognitions, setRecognitions] = useState<RecognitionView[]>([]);
  const publishRecognition = useCallback((view: RecognitionView) => {
    setLastRecognition(view);
    setRecognitions((previous) => [
      ...previous.filter((entry) => entry.sequence !== view.sequence),
      view,
    ]);
  }, []);
  const cameraErrorTimes = useRef<number[]>([]);
  const lastPublished = useRef<PublishedDiagnostics | null>(null);
  const [lastPhoto, setLastPhoto] = useState<CapturedPhoto | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState(initialDiagnostics);

  const receiveDiagnostics = useCallback((next: PublishedDiagnostics) => {
    if (fatalDetectorOnJS.current) return;
    if (
      next.photoRequested ||
      next.photosDoneApplied > 0 ||
      next.watchdogFired
    ) {
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: next.watchdogFired
              ? "capture-watchdog"
              : next.photoRequested
                ? "capture-requested"
                : "photo-done-applied",
            atMs: Date.now(),
            sampleId: next.sampleId,
            photosDone: next.photosDoneApplied,
            phase: next.phase,
          }),
      );
    }
    if (next.rearmReason !== null) {
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "capture-rearmed",
            atMs: Date.now(),
            reason: next.rearmReason,
            sampleId: next.sampleId,
            changeCorrelation: next.changeCorrelation,
          }),
      );
    }
    if (
      next.phase === "cooldown" &&
      next.observation.detected &&
      next.sampleId % 5 === 0
    ) {
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "cooldown-sample",
            atMs: Date.now(),
            sampleId: next.sampleId,
            torch: torchRef.current,
            changeCorrelation: next.changeCorrelation,
            rawChangeCorrelation: next.rawChangeCorrelation,
            background: next.background,
            signatureTexture: next.signatureTexture,
            areaRatio: next.observation.areaRatio,
            signature: next.observation.signature.map((value) =>
              Math.round(value),
            ),
          }),
      );
    }
    if (next.resumedAfterGapMs > 0) {
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "capture-resumed-after-gap",
            atMs: Date.now(),
            gapMs: Math.round(next.resumedAfterGapMs),
            phase: next.phase,
          }),
      );
    }
    lastPublished.current = next;
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
              edgeSupports: observation.edgeSupports.map((value) =>
                roundScalar(value),
              ),
              fallbackEdges: observation.fallbackEdges,
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
              changeCorrelation:
                published.changeCorrelation === null
                  ? null
                  : roundScalar(published.changeCorrelation),
              background: published.background,
              torch: torchRef.current,
              signatureTexture:
                published.signatureTexture === null
                  ? null
                  : roundScalar(published.signatureTexture),
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

  const queueRecognition = useCallback(
    (
      photoPath: string,
      quad: CardQuad,
      signature: number[] | null,
      sequence: number,
      startedAtMs: number,
    ) => {
      if (recognition === null) return;
      const scanId = `${recognitionSessionId.current}-${sequence}`;
      publishRecognition({ status: "pending", sequence });
      recognitionQueue.current = recognitionQueue.current.then(async () => {
        try {
          const result =
            recognition.mode === "device"
              ? await recognizeOnDevice(recognition, photoPath, quad, scanId)
              : await recognizePhoto(recognition, photoPath, quad, scanId);
          const endToEndMs = Date.now() - startedAtMs;
          console.log(
            "NATIVE_PREVIEW_EVENT " +
              JSON.stringify({
                event: "recognition-result",
                atMs: Date.now(),
                sequence,
                scanId,
                endToEndMs,
                serviceLatencyMs: result.serviceLatencyMs,
                accepted: result.accepted,
                acceptedScryfallId: result.acceptedScryfallId,
                reasons: result.reasons,
                candidates: result.candidates.slice(0, 3),
              }),
          );
          publishRecognition({ status: "done", sequence, endToEndMs, result });
          const notACard = isNotACard(result.reasons);
          if (notACard && signature !== null) {
            const kept: number[][] = [];
            const existing = backgroundSignatures.value;
            for (
              let index = Math.max(0, existing.length - 3);
              index < existing.length;
              index += 1
            ) {
              const copy: number[] = [];
              for (let cell = 0; cell < existing[index]!.length; cell += 1)
                copy.push(existing[index]![cell]!);
              kept.push(copy);
            }
            kept.push(signature);
            backgroundSignatures.value = kept;
            const rearm = captureSequence.current === sequence;
            if (rearm) {
              const current = captureCommands.value;
              captureCommands.value = {
                resets: current.resets,
                photosDone: current.photosDone,
                photosFailed: current.photosFailed,
                failureStreak: current.failureStreak,
                rearms: current.rearms + 1,
                resumes: current.resumes,
              };
            }
            console.log(
              "NATIVE_PREVIEW_EVENT " +
                JSON.stringify({
                  event: "background-learned",
                  atMs: Date.now(),
                  sequence,
                  backgrounds: kept.length,
                  rearmed: rearm,
                }),
            );
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          console.log(
            "NATIVE_PREVIEW_EVENT " +
              JSON.stringify({
                event: "recognition-failure",
                atMs: Date.now(),
                sequence,
                scanId,
                message,
              }),
          );
          publishRecognition({ status: "failed", sequence, message });
        }
      });
    },
    [recognition, backgroundSignatures, captureCommands, publishRecognition],
  );

  const takeExactlyOnePhoto = useCallback(
    async (quad: CardQuad | null, signature: number[] | null) => {
      if (jsCaptureGuard.current || fatalDetectorOnJS.current) {
        console.log(
          "NATIVE_PREVIEW_EVENT " +
            JSON.stringify({
              event: "capture-request-dropped",
              atMs: Date.now(),
              reason: fatalDetectorOnJS.current ? "fatal" : "photo-in-flight",
            }),
        );
        return;
      }
      jsCaptureGuard.current = true;
      const sequence = ++captureSequence.current;
      photoInFlight.value = sequence;
      setPhotoInFlightOnJS(true);
      const startedAtMs = Date.now();
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "capture-js-start",
            atMs: startedAtMs,
            sequence,
            torch: torchRef.current,
            signature:
              signature === null
                ? null
                : signature.map((value) => Math.round(value)),
          }),
      );
      setError(null);
      setDiagnostics((current) => ({ ...current, phase: "capturing" }));
      try {
        if (camera.current === null) throw new Error("camera-not-ready");
        const photo = await camera.current.takePhoto({ flash: "off" });
        setLastPhoto({ width: photo.width, height: photo.height });
        setPhotoCount((count) => count + 1);
        consecutiveCaptureFailures.current = 0;
        const current = captureCommands.value;
        captureCommands.value = {
          resets: current.resets,
          photosDone: current.photosDone + 1,
          photosFailed: current.photosFailed,
          failureStreak: current.failureStreak,
          rearms: current.rearms,
          resumes: current.resumes,
        };
        console.log(
          "NATIVE_PREVIEW_EVENT " +
            JSON.stringify({
              event: "capture-success",
              atMs: Date.now(),
              sequence,
              width: photo.width,
              height: photo.height,
              orientation: photo.orientation,
              isMirrored: photo.isMirrored,
            }),
        );
        setDiagnostics((current) => ({
          ...current,
          phase: "cooldown",
          captureLocked: true,
        }));
        if (quad !== null)
          queueRecognition(photo.path, quad, signature, sequence, startedAtMs);
      } catch {
        const failures = ++consecutiveCaptureFailures.current;
        const recovered = recoverFromCaptureFailure(failures);
        console.log(
          "NATIVE_PREVIEW_EVENT " +
            JSON.stringify({
              event: "capture-failure",
              atMs: Date.now(),
              sequence,
              code: 1,
              consecutiveFailures: failures,
              afterPhase: recovered.phase,
            }),
        );
        const current = captureCommands.value;
        captureCommands.value = {
          resets: current.resets,
          photosDone: current.photosDone,
          photosFailed: current.photosFailed + 1,
          failureStreak: failures,
          rearms: current.rearms,
          resumes: current.resumes,
        };
        setError(
          recovered.phase === "error"
            ? "Capture failed repeatedly. Reset the study to try again."
            : "Capture failed. It will retry when the card is steady.",
        );
        setDiagnostics((current) => ({
          ...current,
          phase: recovered.phase,
          captureLocked: recovered.captureLocked,
        }));
      } finally {
        jsCaptureGuard.current = false;
        photoInFlight.value = 0;
        setPhotoInFlightOnJS(false);
      }
    },
    [camera, captureCommands, photoInFlight, queueRecognition],
  );
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
        const commanded = applyCaptureCommands(
          {
            machine: machine.value,
            guard: workletCaptureGuard.value,
            previousCorners: previousCorners.value,
            capturedSignature: capturedSignature.value,
          },
          captureCommands.value,
          appliedCaptureCommands.value,
          performance.now(),
          photoInFlight.value !== 0,
          thresholds.dwellMs,
        );
        const photosDoneApplied =
          commanded.applied.photosDone > appliedCaptureCommands.value.photosDone
            ? commanded.applied.photosDone
            : 0;
        const watchdogFired = commanded.watchdogFired;
        machine.value = commanded.state.machine;
        workletCaptureGuard.value = commanded.state.guard;
        previousCorners.value = commanded.state.previousCorners;
        capturedSignature.value = commanded.state.capturedSignature;
        appliedCaptureCommands.value = commanded.applied;
        const gapMs =
          previousSampleWallAtMs.value > 0
            ? sampleWallAtMs - previousSampleWallAtMs.value
            : 0;
        const resumedAfterGapMs = gapMs > RESUME_GAP_MS ? gapMs : 0;
        if (resumedAfterGapMs > 0) {
          previousCorners.value = null;
          machine.value = resumeCaptureMachine(machine.value);
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
        const step = stepQuadCapture(
          {
            machine: machine.value,
            guard: workletCaptureGuard.value,
            previousCorners: previousCorners.value,
            capturedSignature: capturedSignature.value,
            backgrounds: backgroundSignatures.value,
          },
          observation,
          gates.all,
          orientedDimensions.width,
          orientedDimensions.height,
          performance.now(),
          thresholds,
        );
        const { captureGates, motion, changeCorrelation, background } = step;
        const texture = signatureTexture(observation.signature);
        const rawChangeCorrelation = observation.detected
          ? rawSignatureCorrelation(
              capturedSignature.value,
              observation.signature,
            )
          : null;
        previousCorners.value = step.state.previousCorners;
        const phaseBefore = machine.value.phase;
        let phase = machine.value.phase;
        let captureLocked = machine.value.captureLocked;
        let requestCapture = false;
        let rearmReason: string | null = null;
        if (AUTOMATIC_CAPTURE_ENABLED) {
          if (
            phaseBefore === "cooldown" &&
            step.state.machine.phase !== "cooldown"
          )
            rearmReason = captureGates.present ? "card-changed" : "card-absent";
          machine.value = step.state.machine;
          workletCaptureGuard.value = step.state.guard;
          capturedSignature.value = step.state.capturedSignature;
          phase = step.state.machine.phase;
          captureLocked = step.state.machine.captureLocked;
          requestCapture = step.requestPhoto;
        }

        try {
          publishDiagnostics({
            phase,
            observation,
            gates,
            captureGates,
            motion,
            changeCorrelation,
            rawChangeCorrelation,
            background,
            signatureTexture: texture,
            captureLocked,
            resumedAfterGapMs,
            rearmReason,
            photosDoneApplied,
            watchdogFired,
            photoRequested: requestCapture,
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
        if (requestCapture) {
          const triggerQuad =
            observation.topLeft !== null &&
            observation.topRight !== null &&
            observation.bottomRight !== null &&
            observation.bottomLeft !== null
              ? {
                  topLeft: {
                    x: observation.topLeft.x,
                    y: observation.topLeft.y,
                  },
                  topRight: {
                    x: observation.topRight.x,
                    y: observation.topRight.y,
                  },
                  bottomRight: {
                    x: observation.bottomRight.x,
                    y: observation.bottomRight.y,
                  },
                  bottomLeft: {
                    x: observation.bottomLeft.x,
                    y: observation.bottomLeft.y,
                  },
                }
              : null;
          const triggerSignature: number[] = [];
          for (let index = 0; index < observation.signature.length; index += 1)
            triggerSignature.push(observation.signature[index]!);
          requestPhotoOnJS(
            triggerQuad,
            triggerSignature.length > 0 ? triggerSignature : null,
          );
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
      capturedSignature,
      backgroundSignatures,
      captureCommands,
      appliedCaptureCommands,
      photoInFlight,
      previousSampleWallAtMs,
      requestPhotoOnJS,
      sampleSequence,
      thresholds,
      workletCaptureGuard,
    ],
  );

  const reportCameraError = useCallback(
    (error: CameraRuntimeError) => {
      const atMs = Date.now();
      cameraErrorTimes.current = [
        ...cameraErrorTimes.current.filter(
          (time) => atMs - time < CAMERA_ERROR_WINDOW_MS,
        ),
        atMs,
      ];
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "camera-error",
            atMs,
            code: error.code,
            message: error.message,
            recentErrors: cameraErrorTimes.current.length,
          }),
      );
      if (cameraErrorTimes.current.length >= CAMERA_ERROR_LIMIT) {
        stopDetectorOnJS(40, atMs);
        return;
      }
      const current = captureCommands.value;
      captureCommands.value = {
        resets: current.resets,
        photosDone: current.photosDone,
        photosFailed: current.photosFailed,
        failureStreak: current.failureStreak,
        rearms: current.rearms,
        resumes: current.resumes + 1,
      };
    },
    [captureCommands, stopDetectorOnJS],
  );

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
    if (jsCaptureGuard.current) {
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
    const current = captureCommands.value;
    captureCommands.value = {
      resets: current.resets + 1,
      photosDone: current.photosDone,
      photosFailed: current.photosFailed,
      failureStreak: current.failureStreak,
      rearms: current.rearms,
      resumes: current.resumes,
    };
    setLastPhoto(null);
    setPhotoCount(0);
    consecutiveCaptureFailures.current = 0;
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
    captureCommands,
    previousSampleWallAtMs,
  ]);

  return {
    frameProcessor,
    diagnostics,
    lastPhoto,
    photoCount,
    photoInFlight: photoInFlightOnJS,
    recognitionEnabled: recognition !== null,
    lastRecognition,
    recognitions,
    error,
    thresholds,
    reset,
    reportCameraError,
  };
}

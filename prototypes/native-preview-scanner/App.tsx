import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
} from "react-native-vision-camera";
import {
  AUTOMATIC_CAPTURE_ENABLED,
  DETECTOR_THRESHOLDS,
} from "./src/capture/config";
import { usePreviewCardCapture } from "./src/capture/usePreviewCardCapture";
import {
  REFINEMENT_STATUS_LABELS,
  type DetectorPoint,
} from "./src/detector/validation";

const formatNumber = (value: number, digits = 1) =>
  Number.isFinite(value) ? value.toFixed(digits) : "n/a";

const containedPreview = (
  container: LayoutRectangle,
  imageWidth: number,
  imageHeight: number,
): LayoutRectangle | null => {
  if (
    container.width <= 0 ||
    container.height <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  )
    return null;
  const scale = Math.min(
    container.width / imageWidth,
    container.height / imageHeight,
  );
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  return {
    x: (container.width - width) / 2,
    y: (container.height - height) / 2,
    width,
    height,
  };
};

export default function App() {
  const camera = useRef<Camera>(null);
  const [container, setContainer] = useState<LayoutRectangle>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const device = useCameraDevice("back", {
    physicalDevices: ["wide-angle-camera"],
  });
  const format = useCameraFormat(device, [
    { videoResolution: { width: 1280, height: 720 } },
    { photoResolution: "max" },
    { fps: 30 },
  ]);
  const { hasPermission, requestPermission } = useCameraPermission();
  const capture = usePreviewCardCapture(camera);
  const actualFps = format
    ? Math.max(format.minFps, Math.min(30, format.maxFps))
    : 30;
  const formatLabel = useMemo(
    () =>
      format
        ? `${format.videoWidth}x${format.videoHeight} YUV preview at ${actualFps} fps; ${format.photoWidth}x${format.photoHeight} photo`
        : "Negotiating camera format",
    [actualFps, format],
  );

  useEffect(() => {
    if (format)
      console.log(
        "NATIVE_PREVIEW_EVENT " +
          JSON.stringify({
            event: "camera-format-selected",
            atMs: Date.now(),
            videoWidth: format.videoWidth,
            videoHeight: format.videoHeight,
            photoWidth: format.photoWidth,
            photoHeight: format.photoHeight,
            fps: actualFps,
          }),
      );
  }, [actualFps, format]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <StatusBar style="light" />
        <Text style={styles.title}>Card capture spike</Text>
        <Text style={styles.body}>
          This development build needs camera access. Frames and photos stay on
          this phone. Expo Go cannot load the native detector.
        </Text>
        <Pressable style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Allow camera</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!device || !format) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <ActivityIndicator color="#d8ff62" />
        <Text style={styles.body}>Finding the back camera and format...</Text>
      </SafeAreaView>
    );
  }

  const { diagnostics } = capture;
  const observation = diagnostics.observation;
  const preview = containedPreview(
    container,
    diagnostics.orientedFrameWidth,
    diagnostics.orientedFrameHeight,
  );
  const mapPoint = (point: DetectorPoint | null) =>
    point && preview
      ? {
          x: preview.x + point.x * preview.width,
          y: preview.y + point.y * preview.height,
        }
      : null;
  const quad = observation.detected
    ? [
        mapPoint(observation.topLeft),
        mapPoint(observation.topRight),
        mapPoint(observation.bottomRight),
        mapPoint(observation.bottomLeft),
      ]
    : null;
  const proposalQuad = observation.proposalDetected
    ? [
        mapPoint(observation.proposalTopLeft),
        mapPoint(observation.proposalTopRight),
        mapPoint(observation.proposalBottomRight),
        mapPoint(observation.proposalBottomLeft),
      ]
    : null;
  const fatal = diagnostics.fatalErrorCode !== 0;
  const statusLabel =
    REFINEMENT_STATUS_LABELS[observation.refinementStatus] ?? "unknown";

  return (
    <View
      style={styles.root}
      onLayout={({ nativeEvent }) => setContainer(nativeEvent.layout)}
    >
      <StatusBar style="light" />
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        fps={actualFps}
        isActive={!fatal}
        photo
        video={false}
        audio={false}
        pixelFormat="yuv"
        frameProcessor={capture.frameProcessor}
        resizeMode="contain"
        onError={capture.reportFatalCameraError}
      />

      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {proposalQuad?.every((point) => point !== null) ? (
          <QuadOverlay
            points={proposalQuad as { x: number; y: number }[]}
            edgeStyle={styles.proposalEdge}
          />
        ) : null}
        {quad?.every((point) => point !== null) ? (
          <QuadOverlay
            points={quad as { x: number; y: number }[]}
            edgeStyle={styles.quadEdge}
          />
        ) : null}
      </View>

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.statusPanel}>
          <Text
            style={[styles.phase, fatal ? styles.failText : styles.waitText]}
          >
            {fatal
              ? `Detector locked, code ${diagnostics.fatalErrorCode}`
              : observation.detected
                ? "Card edges refined"
                : `Seeking a card: ${statusLabel}`}
          </Text>
          <Text style={styles.format}>{formatLabel}</Text>
          <Text style={styles.disabledCapture}>
            Automatic capture: {AUTOMATIC_CAPTURE_ENABLED ? "ON" : "OFF"}.
            Photos: {capture.photoCount}
          </Text>
          {capture.error ? (
            <Text style={styles.error}>{capture.error}</Text>
          ) : null}
        </View>

        <View style={styles.spacer} />

        <View style={styles.metricsPanel}>
          <Metric
            label="Refined"
            pass={diagnostics.gates.detected}
            value={`${statusLabel}; proposal ${observation.proposalDetected ? "yes" : "no"}`}
          />
          <Metric
            label="Confidence"
            pass={diagnostics.gates.confidence}
            value={`${formatNumber(observation.confidence, 3)} / ${DETECTOR_THRESHOLDS.confidenceMin}`}
          />
          <Metric
            label="Area"
            pass={diagnostics.gates.area}
            value={`${formatNumber(observation.areaRatio, 3)} in ${DETECTOR_THRESHOLDS.areaRatioMin}-${DETECTOR_THRESHOLDS.areaRatioMax}`}
          />
          <Metric
            label="Aspect"
            pass={diagnostics.gates.aspect}
            value={`${formatNumber(observation.aspectRatio, 3)} in ${DETECTOR_THRESHOLDS.aspectRatioMin}-${DETECTOR_THRESHOLDS.aspectRatioMax}`}
          />
          <Metric
            label="Edges"
            pass={diagnostics.gates.edges}
            value={`support ${formatNumber(observation.edgeSupportMin, 2)} >= ${DETECTOR_THRESHOLDS.edgeSupportMin}`}
          />
          <Text style={styles.telemetry}>
            Edge shift from proposal T/R/B/L{" "}
            {formatNumber(observation.shiftTop, 3)}/
            {formatNumber(observation.shiftRight, 3)}/
            {formatNumber(observation.shiftBottom, 3)}/
            {formatNumber(observation.shiftLeft, 3)} of short side; center
            offset {formatNumber(observation.centerOffset, 3)}.
          </Text>
          <Text style={styles.telemetry}>
            Post-publish total {formatNumber(diagnostics.timing.p50Ms, 2)} ms
            p50, {formatNumber(diagnostics.timing.p95Ms, 2)} ms p95,{" "}
            {formatNumber(diagnostics.timing.maxMs, 2)} ms max over{" "}
            {diagnostics.timing.sampleCount}/300 samples. Native{" "}
            {formatNumber(observation.nativeDurationMs, 2)} ms, proposal{" "}
            {formatNumber(observation.proposalDurationMs, 2)} ms.
          </Text>
          <Text style={styles.telemetry}>
            Cadence {formatNumber(diagnostics.timing.effectiveHz, 2)} Hz{" "}
            {diagnostics.timing.cadencePass ? "PASS" : "WAIT"}; span{" "}
            {formatNumber(diagnostics.timing.elapsedSpanMs / 1_000, 1)} s; max
            gap {formatNumber(diagnostics.timing.maxGapMs, 0)} ms; slow streak{" "}
            {diagnostics.consecutiveSlowSamples}/10.
          </Text>
          <Text style={styles.telemetry}>
            Orientation {observation.orientationCode}; frame{" "}
            {diagnostics.frameWidth}x{diagnostics.frameHeight} to{" "}
            {diagnostics.orientedFrameWidth}x{diagnostics.orientedFrameHeight}.
          </Text>
          <Metric
            label="Capture"
            pass={diagnostics.captureGates.all}
            value={`${diagnostics.phase}; stable ${diagnostics.captureGates.stable ? "yes" : "no"} (motion ${diagnostics.motion === null ? "n/a" : formatNumber(diagnostics.motion, 3)}); card evidence ${diagnostics.captureGates.departed ? "no" : "yes"}`}
          />
          <Text style={styles.telemetry}>
            Photos this study: {capture.photoCount}. Last photo:{" "}
            {capture.lastPhoto
              ? `${capture.lastPhoto.width}x${capture.lastPhoto.height}`
              : "none"}
            . Photos stay on this phone.
          </Text>
          <View style={styles.buttonRow}>
            <Pressable
              disabled={fatal || diagnostics.phase === "capturing"}
              style={[
                styles.button,
                (fatal || diagnostics.phase === "capturing") &&
                  styles.buttonDisabled,
              ]}
              onPress={capture.reset}
            >
              <Text style={styles.buttonText}>Reset study</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

function QuadOverlay({
  points,
  edgeStyle,
}: {
  points: { x: number; y: number }[];
  edgeStyle: StyleProp<ViewStyle>;
}) {
  return (
    <>
      {[0, 1, 2, 3].map((index) => {
        const start = points[index]!;
        const end = points[(index + 1) % 4]!;
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        return (
          <View
            key={index}
            style={[
              edgeStyle,
              {
                left: (start.x + end.x - length) / 2,
                top: (start.y + end.y) / 2 - 1.5,
                width: length,
                transform: [{ rotate: `${angle}rad` }],
              },
            ]}
          />
        );
      })}
    </>
  );
}

function Metric({
  label,
  pass,
  value,
}: {
  label: string;
  pass: boolean;
  value: string;
}) {
  return (
    <View style={styles.metricRow}>
      <Text style={[styles.gate, pass ? styles.pass : styles.fail]}>
        {pass ? "PASS" : "WAIT"}
      </Text>
      <Text style={styles.metricText}>
        {label}: {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080b0d" },
  permissionScreen: {
    flex: 1,
    justifyContent: "center",
    gap: 20,
    padding: 28,
    backgroundColor: "#080b0d",
  },
  title: { color: "white", fontSize: 28, fontWeight: "800" },
  body: { color: "#c7d0d4", fontSize: 16, lineHeight: 24 },
  overlay: { flex: 1, paddingHorizontal: 14 },
  statusPanel: {
    marginTop: 8,
    padding: 10,
    gap: 4,
    borderRadius: 10,
    backgroundColor: "rgba(8, 11, 13, 0.86)",
  },
  phase: { fontSize: 17, fontWeight: "800" },
  waitText: { color: "#f4d06f" },
  failText: { color: "#ff8e8e" },
  format: { color: "#b5c0c5", fontSize: 10 },
  disabledCapture: { color: "#74c7ff", fontSize: 12, fontWeight: "800" },
  error: { color: "#ff8e8e", fontSize: 11 },
  spacer: { flex: 1 },
  metricsPanel: {
    marginBottom: 8,
    padding: 10,
    gap: 5,
    borderRadius: 10,
    backgroundColor: "rgba(8, 11, 13, 0.92)",
  },
  metricRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  gate: {
    width: 40,
    paddingVertical: 2,
    borderRadius: 4,
    overflow: "hidden",
    textAlign: "center",
    fontSize: 10,
    fontWeight: "900",
  },
  pass: { color: "#06120c", backgroundColor: "#9be7c4" },
  fail: { color: "#221900", backgroundColor: "#f4d06f" },
  metricText: { flex: 1, color: "white", fontSize: 10, lineHeight: 14 },
  telemetry: { color: "#b5c0c5", fontSize: 9, lineHeight: 12 },
  buttonRow: { flexDirection: "row", gap: 8 },
  button: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#d8ff62",
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: "#101500", fontSize: 12, fontWeight: "900" },
  proposalEdge: {
    position: "absolute",
    height: 2,
    borderRadius: 1,
    backgroundColor: "#00e5ff",
  },
  quadEdge: {
    position: "absolute",
    height: 3,
    borderRadius: 2,
    backgroundColor: "#ff4fd8",
  },
});

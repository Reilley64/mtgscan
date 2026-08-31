import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraFormat,
  useCameraPermission,
  type CameraRuntimeError,
} from "react-native-vision-camera";
import { GUIDE_WIDTH_FRACTION } from "./src/capture/config";
import { usePreviewCardCapture } from "./src/capture/usePreviewCardCapture";

const phaseCopy = {
  seeking: "Seeking a centered card",
  holding: "Hold still",
  capturing: "Capturing one high-resolution still",
  cooldown: "Captured. Remove the card or reset.",
  error: "Capture error",
} as const;

const formatNumber = (value: number, digits = 1) =>
  Number.isFinite(value) ? value.toFixed(digits) : "n/a";

export default function App() {
  const camera = useRef<Camera>(null);
  const device = useCameraDevice("back", {
    physicalDevices: ["wide-angle-camera"],
  });
  const format = useCameraFormat(device, [
    { photoResolution: "max" },
    { videoResolution: { width: 1280, height: 720 } },
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
      console.log("Selected native preview format", formatLabel, format);
  }, [format, formatLabel]);

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.permissionScreen}>
        <StatusBar style="light" />
        <Text style={styles.title}>Native preview capture spike</Text>
        <Text style={styles.body}>
          This development build needs camera access. It does not record audio
          or video. Expo Go cannot run this native frame-processor prototype.
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

  const { diagnostics, thresholds } = capture;
  const onCameraError = (cameraError: CameraRuntimeError) => {
    console.error("VisionCamera runtime error", cameraError);
    capture.reportError(cameraError.message);
  };

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        fps={actualFps}
        isActive
        photo
        video={false}
        audio={false}
        pixelFormat="yuv"
        frameProcessor={capture.frameProcessor}
        resizeMode="cover"
        onError={onCameraError}
      />

      <View pointerEvents="none" style={styles.guideLayer}>
        <View
          style={[
            styles.guide,
            { width: `${GUIDE_WIDTH_FRACTION * 100}%` },
            diagnostics.gates.all && styles.guideReady,
          ]}
        />
      </View>

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        <View style={styles.statusPanel}>
          <Text style={[styles.phase, styles[`phase_${diagnostics.phase}`]]}>
            {phaseCopy[diagnostics.phase]}
          </Text>
          <Text style={styles.format}>{formatLabel}</Text>
          {capture.error ? (
            <Text style={styles.error}>{capture.error}</Text>
          ) : null}
        </View>

        <View style={styles.spacer} />

        <View style={styles.metricsPanel}>
          <Metric
            label="Presence"
            pass={diagnostics.gates.present}
            value={`border ${formatNumber(diagnostics.metrics.borderEnergy)} / ${thresholds.borderEnergyMin}; continuity ${formatNumber(diagnostics.metrics.borderContinuity, 2)} / ${thresholds.borderContinuityMin}; variance ${formatNumber(diagnostics.metrics.interiorVariance, 0)} / ${thresholds.interiorVarianceMin}`}
          />
          <Metric
            label="Centered"
            pass={diagnostics.gates.centered}
            value={`${formatNumber(diagnostics.metrics.centerScore, 2)} / ${thresholds.centerScoreMin}`}
          />
          <Metric
            label="Sharp"
            pass={diagnostics.gates.sharp}
            value={`${formatNumber(diagnostics.metrics.sharpness)} / ${thresholds.sharpnessMin}`}
          />
          <Metric
            label="Stable"
            pass={diagnostics.gates.stable}
            value={`${formatNumber(diagnostics.metrics.motion)} <= ${thresholds.motionMax}`}
          />
          <Text style={styles.telemetry}>
            Analysis {formatNumber(diagnostics.metrics.processingMs, 2)} ms at 5
            fps. Dwell {thresholds.dwellMs} ms; departure reset{" "}
            {thresholds.departureMs} ms.
          </Text>
          <Text style={styles.telemetry}>
            Departure {diagnostics.gates.departed ? "YES" : "NO"}: continuity
            &lt;= {thresholds.departureBorderContinuityMax}; variance &lt;={" "}
            {thresholds.departureVarianceMax}.
          </Text>
          <Text style={styles.telemetry}>
            Last photo:{" "}
            {capture.lastPhoto
              ? `${capture.lastPhoto.width}x${capture.lastPhoto.height} ${capture.lastPhoto.path}`
              : "none"}
          </Text>
          <Pressable style={styles.button} onPress={capture.reset}>
            <Text style={styles.buttonText}>Manual reset</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
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
    padding: 12,
    gap: 6,
    borderRadius: 10,
    backgroundColor: "rgba(8, 11, 13, 0.86)",
  },
  phase: { fontSize: 18, fontWeight: "800" },
  phase_seeking: { color: "#f4d06f" },
  phase_holding: { color: "#d8ff62" },
  phase_capturing: { color: "#74c7ff" },
  phase_cooldown: { color: "#9be7c4" },
  phase_error: { color: "#ff8e8e" },
  format: { color: "#b5c0c5", fontSize: 11 },
  error: { color: "#ff8e8e", fontSize: 12 },
  spacer: { flex: 1 },
  metricsPanel: {
    marginBottom: 8,
    padding: 12,
    gap: 7,
    borderRadius: 10,
    backgroundColor: "rgba(8, 11, 13, 0.9)",
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
  metricText: { flex: 1, color: "white", fontSize: 11, lineHeight: 15 },
  telemetry: { color: "#b5c0c5", fontSize: 10, lineHeight: 14 },
  button: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#d8ff62",
  },
  buttonText: { color: "#101500", fontSize: 15, fontWeight: "900" },
  guideLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  guide: {
    aspectRatio: 63 / 88,
    borderWidth: 3,
    borderRadius: 15,
    borderColor: "#f4d06f",
    backgroundColor: "transparent",
  },
  guideReady: {
    borderColor: "#9be7c4",
    shadowColor: "#9be7c4",
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
});

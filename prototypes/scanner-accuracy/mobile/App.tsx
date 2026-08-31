import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Button,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  FinishSchema,
  RecognitionResponseSchema,
  type Finish,
  type RecognitionRequest,
  type RecognitionResponse,
  type OutcomeSubmission,
} from "@scanner-accuracy/shared";

type BatchEntry = {
  scanId: string;
  name: string;
  scryfallId: string;
  language: string;
  finish: Finish;
};
const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const serviceDefault =
  process.env.EXPO_PUBLIC_RECOGNITION_URL ?? "http://127.0.0.1:4317";
const prototypeToken = process.env.EXPO_PUBLIC_PROTOTYPE_TOKEN ?? "";
const delay = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export default function App() {
  const camera = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [ready, setReady] = useState(false);
  const [facing] = useState<CameraType>("back");
  const [serviceUrl, setServiceUrl] = useState(serviceDefault);
  const [quality, setQuality] = useState(0.7);
  const [progress, setProgress] = useState("Ready");
  const [error, setError] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<RecognitionResponse | null>(
    null,
  );
  const [selectedId, setSelectedId] = useState("");
  const [language, setLanguage] = useState("en");
  const [finish, setFinish] = useState<Finish>("unknown");
  const [batch, setBatch] = useState<BatchEntry[]>([]);
  const [scanStartedAt, setScanStartedAt] = useState<string | null>(null);
  const [endToEndProposalLatencyMs, setEndToEndProposalLatencyMs] = useState<
    number | null
  >(null);
  const sessionId = useRef(makeId()).current;
  const recognitionLocked = useRef(false);

  async function captureAndRecognize() {
    if (!camera.current || !ready || recognition || recognitionLocked.current)
      return;
    recognitionLocked.current = true;
    setError(null);
    const proposalStartedAt = Date.now();
    const started = new Date(proposalStartedAt).toISOString();
    setScanStartedAt(started);
    try {
      if (!prototypeToken)
        throw new Error("EXPO_PUBLIC_PROTOTYPE_TOKEN is required.");
      const captures: RecognitionRequest["captures"][number][] = [];
      for (let index = 0; index < 3; index++) {
        setProgress(`Capturing still ${index + 1} of 3…`);
        const picture = await camera.current.takePictureAsync({
          quality,
          base64: true,
          skipProcessing: false,
        });
        if (!picture?.base64) throw new Error("Camera returned no JPEG data.");
        captures.push({
          id: `${makeId()}-${index}`,
          kind: "still",
          mimeType: "image/jpeg",
          base64: picture.base64,
          quality,
        });
        await delay(250);
      }
      const scanId = makeId();
      const request: RecognitionRequest = {
        sessionId,
        scanId,
        capturedAt: started,
        captures: [captures[0]!, captures[1]!, captures[2]!],
      };
      setProgress("Uploading captures and ranking candidates…");
      const response = await fetch(
        `${serviceUrl.replace(/\/$/, "")}/recognitions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${prototypeToken}`,
          },
          body: JSON.stringify(request),
        },
      );
      const payload: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          `Service ${response.status}: ${JSON.stringify(payload)}`,
        );
      const parsed = RecognitionResponseSchema.parse(payload);
      setEndToEndProposalLatencyMs(Date.now() - proposalStartedAt);
      setRecognition(parsed);
      const hybrid = parsed.results.find(
        (result) => result.strategy === "hybrid",
      );
      const first = hybrid?.candidates[0];
      if (first) {
        setSelectedId(first.scryfallId);
        setLanguage(first.language);
        setFinish("unknown");
      }
      setProgress(
        hybrid?.abstention.abstained
          ? `Hybrid abstained: ${hybrid.abstention.reasons.join("; ")}`
          : "Hybrid candidate auto-accepted by prototype thresholds. Confirm it below.",
      );
    } catch (caught) {
      recognitionLocked.current = false;
      setError(caught instanceof Error ? caught.message : String(caught));
      setProgress("Recognition failed.");
    }
  }

  async function submitOutcome() {
    if (!recognition || !scanStartedAt || endToEndProposalLatencyMs === null)
      return;
    try {
      if (!prototypeToken)
        throw new Error("EXPO_PUBLIC_PROTOTYPE_TOKEN is required.");
      const selected = {
        selectedScryfallId: selectedId.trim(),
        language: language.trim(),
        finish: FinishSchema.parse(finish),
      };
      const outcome: OutcomeSubmission = {
        sessionId,
        scanId: recognition.scanId,
        selected,
        groundTruth: selected,
        scanStartedAt,
        scanCompletedAt: new Date().toISOString(),
        endToEndProposalLatencyMs,
      };
      setProgress("Recording benchmark outcome…");
      const response = await fetch(
        `${serviceUrl.replace(/\/$/, "")}/outcomes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${prototypeToken}`,
          },
          body: JSON.stringify(outcome),
        },
      );
      if (!response.ok)
        throw new Error(
          `Outcome service returned ${response.status}: ${await response.text()}`,
        );
      const hybrid = recognition.results.find(
        (result) => result.strategy === "hybrid",
      );
      const candidate = hybrid?.candidates.find(
        (item) => item.scryfallId === selected.selectedScryfallId,
      );
      setBatch((entries) => [
        ...entries,
        {
          scanId: recognition.scanId,
          name: candidate?.name ?? "Manual Scryfall printing",
          scryfallId: selected.selectedScryfallId,
          language: selected.language,
          finish: selected.finish,
        },
      ]);
      setRecognition(null);
      recognitionLocked.current = false;
      setProgress("Outcome recorded. Ready for the next physical card.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setProgress("Outcome submission failed.");
    }
  }

  if (!permission)
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
        <Text>Checking camera permission…</Text>
      </SafeAreaView>
    );
  if (!permission.granted)
    return (
      <SafeAreaView style={styles.center}>
        <Text>
          Camera permission is required to run the physical-card benchmark.
        </Text>
        <Button title="Request camera permission" onPress={requestPermission} />
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Scanner accuracy prototype</Text>
        <Text>
          This is a throwaway physical-card evidence harness. It does not update
          a collection.
        </Text>
        <Text style={styles.label}>LAN service URL</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          value={serviceUrl}
          onChangeText={setServiceUrl}
        />
        <View style={styles.cameraFrame}>
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing={facing}
            onCameraReady={() => setReady(true)}
          />
          <View pointerEvents="none" style={styles.cardGuide}>
            <Text style={styles.guideText}>CENTER CARD HERE</Text>
          </View>
        </View>
        <Text>
          Keep the whole card inside the guide. Hold steady and avoid glare.
        </Text>
        <Text style={styles.label}>JPEG quality</Text>
        <View style={styles.row}>
          {[0.45, 0.7, 0.9].map((value) => (
            <Pressable
              key={value}
              style={[styles.choice, quality === value && styles.selected]}
              onPress={() => setQuality(value)}
            >
              <Text>{value}</Text>
            </Pressable>
          ))}
        </View>
        <Button
          title={
            recognition
              ? "Record the displayed outcome before another scan"
              : "Capture 3 stills and recognize"
          }
          disabled={!ready || recognition !== null || recognitionLocked.current}
          onPress={captureAndRecognize}
        />
        <Text style={styles.status}>{progress}</Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {recognition && (
          <View style={styles.results}>
            <Text style={styles.subtitle}>
              Proposal timing: {endToEndProposalLatencyMs} ms end-to-end;{" "}
              {recognition.serviceLatencyMs} ms service
            </Text>
            {recognition.results.map((result) => (
              <View key={result.strategy}>
                <Text style={styles.label}>
                  {result.strategy}{" "}
                  {result.abstention.abstained
                    ? `— abstained: ${result.abstention.reasons.join("; ")}`
                    : ""}
                </Text>
                {result.candidates.slice(0, 5).map((candidate, index) => (
                  <Pressable
                    key={candidate.scryfallId}
                    style={[
                      styles.candidate,
                      result.strategy === "hybrid" &&
                        selectedId === candidate.scryfallId &&
                        styles.selected,
                    ]}
                    onPress={() => {
                      if (result.strategy === "hybrid") {
                        setSelectedId(candidate.scryfallId);
                        setLanguage(candidate.language);
                        setFinish("unknown");
                      }
                    }}
                  >
                    <Text>
                      {index + 1}. {candidate.name} —{" "}
                      {candidate.set.toUpperCase()} {candidate.collectorNumber}{" "}
                      ({Math.round(candidate.confidence * 100)}%)
                    </Text>
                    {candidate.evidence.map((item) => (
                      <Text key={item.strategy} style={styles.evidence}>
                        {item.strategy}: {item.status}
                        {item.score === undefined
                          ? ""
                          : ` ${Math.round(item.score * 100)}%`}{" "}
                        — {item.detail}
                      </Text>
                    ))}
                  </Pressable>
                ))}
              </View>
            ))}
            <Text style={styles.label}>
              Correct Scryfall printing ID — paste the correct ID if it is
              absent from these displayed candidates. Each strategy shows only
              its top five, not the full corpus.
            </Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              value={selectedId}
              onChangeText={setSelectedId}
            />
            <Text style={styles.label}>Language</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              value={language}
              onChangeText={setLanguage}
            />
            <Text style={styles.label}>Finish</Text>
            <View style={styles.row}>
              {FinishSchema.options.map((value) => (
                <Pressable
                  key={value}
                  style={[styles.choice, finish === value && styles.selected]}
                  onPress={() => setFinish(value)}
                >
                  <Text>{value}</Text>
                </Pressable>
              ))}
            </View>
            <Button
              title="Confirm correction and record outcome"
              onPress={submitOutcome}
            />
          </View>
        )}
        <Text style={styles.subtitle}>
          In-memory scan batch ({batch.length})
        </Text>
        {batch.map((entry, index) => (
          <Text key={entry.scanId}>
            {index + 1}. {entry.name} — {entry.language}, {entry.finish}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#f6f6f6" },
  content: { padding: 16, gap: 10 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  title: { fontSize: 24, fontWeight: "700" },
  subtitle: { fontSize: 18, fontWeight: "700", marginTop: 8 },
  label: { fontWeight: "600", marginTop: 4 },
  input: {
    backgroundColor: "white",
    borderColor: "#777",
    borderWidth: 1,
    borderRadius: 4,
    padding: 10,
  },
  cameraFrame: { height: 480, backgroundColor: "black", overflow: "hidden" },
  cardGuide: {
    position: "absolute",
    width: "72%",
    aspectRatio: 63 / 88,
    borderColor: "white",
    borderWidth: 3,
    borderRadius: 10,
    left: "14%",
    top: "11%",
    alignItems: "center",
    justifyContent: "center",
  },
  guideText: {
    color: "white",
    backgroundColor: "rgba(0,0,0,0.65)",
    padding: 5,
    fontWeight: "700",
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: 1,
    borderColor: "#777",
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "white",
  },
  selected: { backgroundColor: "#cfe5ff", borderColor: "#225ea8" },
  status: { backgroundColor: "#e8e8e8", padding: 10 },
  error: { color: "#a40000" },
  results: { gap: 8 },
  candidate: {
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#bbb",
    padding: 10,
  },
  evidence: { color: "#444", fontSize: 12, marginTop: 4 },
});

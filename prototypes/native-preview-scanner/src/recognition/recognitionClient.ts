import type { DetectorPoint } from "../detector/validation";

export type CardQuad = Readonly<{
  topLeft: DetectorPoint;
  topRight: DetectorPoint;
  bottomRight: DetectorPoint;
  bottomLeft: DetectorPoint;
}>;

export type RecognitionCandidate = Readonly<{
  scryfallId: string;
  oracleId: string;
  name: string;
  set: string;
  collectorNumber: string;
  score: number;
}>;

export type RecognitionResult = Readonly<{
  scanId: string;
  serviceLatencyMs: number;
  candidates: readonly RecognitionCandidate[];
  accepted: boolean;
  acceptedScryfallId: string | null;
  reasons: readonly string[];
  premiumMark: boolean;
}>;

export type RecognitionConfig = Readonly<{
  url: string;
  token: string;
  mode: "service" | "device";
}>;

export const RECOGNITION_TIMEOUT_MS = 10_000;

export function isNotACard(reasons: readonly string[]): boolean {
  return reasons.some(
    (reason) =>
      reason.includes("no candidate has a plausible card homography") ||
      reason.startsWith("not a card"),
  );
}

export function recognitionConfig(): RecognitionConfig | null {
  const url = process.env.EXPO_PUBLIC_RECOGNITION_URL;
  const token = process.env.EXPO_PUBLIC_RECOGNITION_TOKEN;
  if (!url || !token) return null;
  return {
    url: url.replace(/\/+$/, ""),
    token,
    mode:
      process.env.EXPO_PUBLIC_RECOGNIZER === "device" ? "device" : "service",
  };
}

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

export function parseRecognitionResponse(
  value: unknown,
): RecognitionResult | null {
  if (typeof value !== "object" || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!isText(record.scanId) || !isFiniteNumber(record.serviceLatencyMs))
    return null;
  if (!Array.isArray(record.candidates)) return null;
  const candidates: RecognitionCandidate[] = [];
  for (const entry of record.candidates) {
    if (typeof entry !== "object" || entry === null) return null;
    const candidate = entry as Record<string, unknown>;
    if (
      !isText(candidate.scryfallId) ||
      !isText(candidate.name) ||
      !isText(candidate.set) ||
      !isText(candidate.collectorNumber) ||
      !isFiniteNumber(candidate.score)
    )
      return null;
    candidates.push({
      scryfallId: candidate.scryfallId,
      oracleId: isText(candidate.oracleId) ? candidate.oracleId : "",
      name: candidate.name,
      set: candidate.set,
      collectorNumber: candidate.collectorNumber,
      score: candidate.score,
    });
  }
  const decision = record.decision as Record<string, unknown> | undefined;
  if (typeof decision !== "object" || decision === null) return null;
  if (typeof decision.accepted !== "boolean") return null;
  const acceptedScryfallId = isText(decision.scryfallId)
    ? decision.scryfallId
    : null;
  if (decision.accepted && acceptedScryfallId === null) return null;
  const reasons = Array.isArray(decision.reasons)
    ? decision.reasons.filter(isText)
    : [];
  const reading = record.reading as Record<string, unknown> | undefined;
  return {
    scanId: record.scanId,
    serviceLatencyMs: record.serviceLatencyMs,
    candidates,
    accepted: decision.accepted,
    acceptedScryfallId,
    reasons,
    premiumMark: reading?.premiumMark === true,
  };
}

export async function recognizePhoto(
  config: RecognitionConfig,
  photoPath: string,
  quad: CardQuad,
  scanId: string,
): Promise<RecognitionResult> {
  const photoUri = photoPath.startsWith("file://")
    ? photoPath
    : `file://${photoPath}`;
  const photo = await (await fetch(photoUri)).blob();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RECOGNITION_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.url}/rectified-recognitions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "image/jpeg",
        "X-Scan-Id": scanId,
        "X-Card-Quad": JSON.stringify(quad),
      },
      body: photo,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`recognition service ${response.status}`);
    const result = parseRecognitionResponse(await response.json());
    if (result === null) throw new Error("invalid recognition response");
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

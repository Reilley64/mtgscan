import type { GeometricResult } from "./geometric-matcher.js";
import type { CorpusCard } from "./ranking.js";

export type RerankRequest = {
  type: "rerank";
  requestId: string;
  stillPaths: [string, string, string];
  candidates: CorpusCard[];
  referenceRoot: string;
};

export type ParentMessage = RerankRequest | { type: "shutdown" };

export const SANITIZED_FRAME_ERROR = "Geometric comparison failed" as const;

export type WorkerMessage =
  | { type: "ready"; pid: number }
  | { type: "startup-error" }
  | {
      type: "result";
      requestId: string;
      result: GeometricResult;
    }
  | {
      type: "job-error";
      requestId: string;
      code: "GEOMETRIC_WORKER_JOB_FAILED";
      message: "Geometric worker failed";
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) {
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 4_096;
}

function isCard(value: unknown): value is CorpusCard {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      [
        "scryfallId",
        "name",
        "set",
        "collectorNumber",
        "language",
        "finishes",
        "imageHash",
      ],
      ["oracleId"],
    )
  )
    return false;
  return (
    isNonEmptyString(value.scryfallId) &&
    (value.oracleId === undefined || isNonEmptyString(value.oracleId)) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.set) &&
    isNonEmptyString(value.collectorNumber) &&
    isNonEmptyString(value.language) &&
    Array.isArray(value.finishes) &&
    value.finishes.length > 0 &&
    value.finishes.length <= 10 &&
    value.finishes.every(isNonEmptyString) &&
    typeof value.imageHash === "string" &&
    value.imageHash.length <= 4_096
  );
}

export function isRerankInput(
  value: unknown,
): value is Omit<RerankRequest, "type" | "requestId"> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["stillPaths", "candidates", "referenceRoot"])
  )
    return false;
  return (
    Array.isArray(value.stillPaths) &&
    value.stillPaths.length === 3 &&
    value.stillPaths.every(isNonEmptyString) &&
    Array.isArray(value.candidates) &&
    value.candidates.length > 0 &&
    value.candidates.length <= 500 &&
    value.candidates.every(isCard) &&
    isNonEmptyString(value.referenceRoot)
  );
}

export function isParentMessage(value: unknown): value is ParentMessage {
  if (!isRecord(value)) return false;
  if (value.type === "shutdown") return Object.keys(value).length === 1;
  if (value.type !== "rerank" || !isNonEmptyString(value.requestId))
    return false;
  if (
    !hasExactKeys(value, [
      "type",
      "requestId",
      "stillPaths",
      "candidates",
      "referenceRoot",
    ])
  )
    return false;
  return (
    Array.isArray(value.stillPaths) &&
    value.stillPaths.length === 3 &&
    value.stillPaths.every(isNonEmptyString) &&
    Array.isArray(value.candidates) &&
    value.candidates.length > 0 &&
    value.candidates.length <= 500 &&
    value.candidates.every(isCard) &&
    isNonEmptyString(value.referenceRoot)
  );
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isFrame(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      [
        "keypoints",
        "goodMatches",
        "inliers",
        "inlierRatio",
        "homographyValid",
        "quadValid",
        "areaFraction",
      ],
      ["error"],
    ) ||
    (Object.hasOwn(value, "error") && value.error !== SANITIZED_FRAME_ERROR)
  )
    return false;
  return (
    isFiniteNonNegative(value.keypoints) &&
    isFiniteNonNegative(value.goodMatches) &&
    isFiniteNonNegative(value.inliers) &&
    isFiniteNonNegative(value.inlierRatio) &&
    typeof value.homographyValid === "boolean" &&
    typeof value.quadValid === "boolean" &&
    isFiniteNonNegative(value.areaFraction)
  );
}

function isGeometricResult(value: unknown): value is GeometricResult {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "candidates",
      "acceptedScryfallId",
      "abstentionReasons",
      "warmLatencyMs",
      "rssBytes",
    ]) ||
    !Array.isArray(value.candidates)
  )
    return false;
  return (
    value.candidates.length <= 500 &&
    value.candidates.every(
      (candidate) =>
        isRecord(candidate) &&
        hasExactKeys(candidate, [
          "card",
          "frames",
          "support",
          "acceptedFrames",
        ]) &&
        isCard(candidate.card) &&
        Array.isArray(candidate.frames) &&
        candidate.frames.length === 3 &&
        candidate.frames.every(isFrame) &&
        isFiniteNonNegative(candidate.support) &&
        isFiniteNonNegative(candidate.acceptedFrames),
    ) &&
    (value.acceptedScryfallId === null ||
      isNonEmptyString(value.acceptedScryfallId)) &&
    Array.isArray(value.abstentionReasons) &&
    value.abstentionReasons.every(
      (reason) => typeof reason === "string" && reason.length <= 4_096,
    ) &&
    isFiniteNonNegative(value.warmLatencyMs) &&
    isFiniteNonNegative(value.rssBytes)
  );
}

export function isWorkerMessage(value: unknown): value is WorkerMessage {
  if (!isRecord(value)) return false;
  if (value.type === "ready")
    return (
      hasExactKeys(value, ["type", "pid"]) &&
      Number.isSafeInteger(value.pid) &&
      (value.pid as number) > 0
    );
  if (value.type === "startup-error") return hasExactKeys(value, ["type"]);
  if (value.type === "result")
    return (
      hasExactKeys(value, ["type", "requestId", "result"]) &&
      isNonEmptyString(value.requestId) &&
      isGeometricResult(value.result)
    );
  return (
    value.type === "job-error" &&
    hasExactKeys(value, ["type", "requestId", "code", "message"]) &&
    isNonEmptyString(value.requestId) &&
    value.code === "GEOMETRIC_WORKER_JOB_FAILED" &&
    value.message === "Geometric worker failed"
  );
}

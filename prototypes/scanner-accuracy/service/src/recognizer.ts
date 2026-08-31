import fs from "node:fs/promises";
import path from "node:path";
import type {
  RecognitionRequest,
  RecognitionResponse,
  Strategy,
} from "@scanner-accuracy/shared";
import {
  differenceHash,
  hashSimilarity,
  normalizedCard,
} from "./image-distance.js";
import { recognizeConstrainedText, tokenSimilarity } from "./ocr.js";
import { decideAbstention, rankStrategy, type CorpusCard } from "./ranking.js";
import { dataRoot } from "./config.js";
const MAX_STILL_BYTES = 12_000_000;
function decoded(capture: RecognitionRequest["captures"][number]) {
  const value = Buffer.from(capture.base64, "base64");
  if (!value.length) throw new Error("capture must contain valid base64");
  if (value.length > MAX_STILL_BYTES)
    throw new Error(`still exceeds ${MAX_STILL_BYTES} decoded bytes`);
  if (!(value[0] === 0xff && value[1] === 0xd8 && value[2] === 0xff))
    throw new Error("still capture content must be JPEG");
  return value;
}
export async function recognize(
  request: RecognitionRequest,
  corpus: CorpusCard[],
): Promise<RecognitionResponse> {
  const started = performance.now();
  if (
    request.captures.length !== 3 ||
    request.captures.some((capture) => capture.kind !== "still")
  )
    throw new Error("exactly three JPEG stills are required");
  const buffers = request.captures.map(decoded);
  const stills = buffers;
  const safeSession = request.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_"),
    safeScan = request.scanId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const captureDirectory = path.join(
    dataRoot,
    "captures",
    safeSession,
    safeScan,
  );
  await fs.mkdir(captureDirectory, { recursive: true });
  await Promise.all(
    request.captures.map(async (_capture, index) => {
      await fs.writeFile(
        path.join(
          captureDirectory,
          `${String(index + 1).padStart(2, "0")}-still.jpg`,
        ),
        buffers[index]!,
      );
    }),
  );
  await fs.writeFile(
    path.join(captureDirectory, "metadata.json"),
    JSON.stringify(
      {
        sessionId: request.sessionId,
        scanId: request.scanId,
        capturedAt: request.capturedAt,
        captures: request.captures.map(({ id, kind, mimeType }, index) => ({
          id,
          kind,
          mimeType,
          quality:
            request.captures[index]?.kind === "still"
              ? request.captures[index].quality
              : undefined,
          bytes: buffers[index]!.length,
        })),
      },
      null,
      2,
    ),
  );
  const hashes = await Promise.all(
    stills.map((still) => differenceHash(still, 0.72)),
  );
  const ocrReads = await Promise.all(
    stills.map(async (still) =>
      recognizeConstrainedText(await normalizedCard(still, 0.72)),
    ),
  );
  const ocrText = ocrReads
    .flatMap((read) => (read.text ? [read.text] : []))
    .join(" ")
    .trim();
  const ocrUnavailable =
    ocrReads.map((read) => read.unavailable).find(Boolean) ??
    "OCR unavailable for all three stills.";
  const inputs = corpus.map((card) => ({
    card,
    imageScore: Math.max(
      ...hashes.map((hash) => hashSimilarity(hash, card.imageHash)),
    ),
    ocrScore: ocrText ? tokenSimilarity(ocrText, card.name) : undefined,
    ocrDetail: ocrText
      ? `Constrained title OCR across three stills read: ${JSON.stringify(ocrText)}`
      : ocrUnavailable,
  }));
  const strategies: Strategy[] = ["image-only", "ocr-only", "hybrid"];
  const results = strategies.map((strategy) => {
    const candidates = rankStrategy(strategy, inputs).slice(0, 10);
    const decision = decideAbstention(
      candidates,
      strategy === "ocr-only" && !ocrText ? ocrUnavailable : undefined,
    );
    return {
      strategy,
      candidates,
      abstention: { abstained: decision.abstained, reasons: decision.reasons },
      autoAcceptedScryfallId: decision.autoAcceptedScryfallId,
    };
  });
  return {
    sessionId: request.sessionId,
    scanId: request.scanId,
    serviceLatencyMs: Math.round(performance.now() - started),
    results,
  };
}

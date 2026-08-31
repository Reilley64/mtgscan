import fs from "node:fs/promises";
import path from "node:path";
import type {
  RecognitionRequest,
  RecognitionResponse,
} from "@scanner-accuracy/shared";
import {
  differenceHash,
  hashSimilarity,
  normalizedCard,
} from "./image-distance.js";
import { recognizeConstrainedText, tokenSimilarity } from "./ocr.js";
import { decideAbstention, fuseAndRank, type CorpusCard } from "./ranking.js";
import { dataRoot } from "./config.js";

export async function recognize(
  request: RecognitionRequest,
  corpus: CorpusCard[],
): Promise<RecognitionResponse> {
  const started = performance.now();
  const stills = request.captures
    .filter((capture) => capture.kind === "still")
    .map((capture) => Buffer.from(capture.base64, "base64"));
  if (stills.length === 0)
    throw new Error("at least one still capture is required");
  if (stills.some((still) => still.length > 12_000_000))
    throw new Error("each still must be at most 12 MB decoded");
  const safeSession = request.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeScan = request.scanId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const captureDirectory = path.join(
    dataRoot,
    "captures",
    safeSession,
    safeScan,
  );
  await fs.mkdir(captureDirectory, { recursive: true });
  await Promise.all(
    request.captures.map(async (capture, index) => {
      const extension =
        capture.kind === "still"
          ? "jpg"
          : capture.mimeType === "video/quicktime"
            ? "mov"
            : "mp4";
      await fs.writeFile(
        path.join(
          captureDirectory,
          `${String(index + 1).padStart(2, "0")}-${capture.kind}.${extension}`,
        ),
        Buffer.from(capture.base64, "base64"),
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
        captures: request.captures.map(
          ({ id, kind, mimeType, quality, base64 }) => ({
            id,
            kind,
            mimeType,
            quality,
            bytes: Buffer.byteLength(base64, "base64"),
          }),
        ),
      },
      null,
      2,
    ),
  );
  const hashes = await Promise.all(
    stills.map((still) => differenceHash(still, 0.72)),
  );
  const ocr = await recognizeConstrainedText(
    await normalizedCard(stills[0]!, 0.72),
  );
  const candidates = fuseAndRank(
    corpus.map((card) => ({
      card,
      imageScore: Math.max(
        ...hashes.map((hash) => hashSimilarity(hash, card.imageHash)),
      ),
      ocrScore: ocr.text ? tokenSimilarity(ocr.text, card.name) : undefined,
      ocrDetail: ocr.text
        ? `Constrained title OCR read: ${JSON.stringify(ocr.text)}`
        : (ocr.unavailable ?? "OCR unavailable."),
    })),
  ).slice(0, 10);
  const decision = decideAbstention(candidates);
  return {
    sessionId: request.sessionId,
    scanId: request.scanId,
    latencyMs: Math.round(performance.now() - started),
    candidates,
    abstention: { abstained: decision.abstained, reasons: decision.reasons },
    autoAcceptedScryfallId: decision.autoAcceptedScryfallId,
  };
}

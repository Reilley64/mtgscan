import fs from "node:fs/promises";
import type http from "node:http";
import path from "node:path";
import {
  MAX_PHOTO_BYTES,
  parseCardQuad,
  RectifiedInputError,
} from "./rectify.js";
import type { RectifiedCorpus } from "./rectified-corpus.js";
import type { RectifiedRerankRunner } from "./rectified-rerank-runner.js";
import { recognizeRectified } from "./rectified-recognizer.js";

export function createRectifiedRecognitionHandler(options: {
  corpus: () => Promise<RectifiedCorpus>;
  runner: RectifiedRerankRunner;
  persistRoot: string;
}) {
  let inFlight = false;
  return async (
    request: http.IncomingMessage,
  ): Promise<{ status: number; body: unknown }> => {
    if (inFlight)
      return { status: 429, body: { error: "recognition busy; retry later" } };
    inFlight = true;
    try {
      const contentType = request.headers["content-type"]
        ?.split(";")[0]
        ?.trim()
        .toLowerCase();
      if (contentType !== "image/jpeg")
        return {
          status: 415,
          body: { error: "Content-Type must be image/jpeg" },
        };
      const scanId = request.headers["x-scan-id"];
      if (typeof scanId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(scanId))
        return {
          status: 400,
          body: { error: "X-Scan-Id must match [A-Za-z0-9_-]{1,80}" },
        };
      const quadHeader = request.headers["x-card-quad"];
      const quad = parseCardQuad(
        typeof quadHeader === "string" ? quadHeader : undefined,
      );
      if (Number(request.headers["content-length"] ?? 0) > MAX_PHOTO_BYTES)
        return { status: 413, body: { error: "photo exceeds 12 MB" } };
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > MAX_PHOTO_BYTES) {
          request.resume();
          return { status: 413, body: { error: "photo exceeds 12 MB" } };
        }
        chunks.push(chunk);
      }
      const photo = Buffer.concat(chunks);
      if (
        photo.length < 4 ||
        photo[0] !== 0xff ||
        photo[1] !== 0xd8 ||
        photo[2] !== 0xff
      )
        return { status: 400, body: { error: "body is not a JPEG" } };
      const { recognition, crop } = await recognizeRectified(
        { scanId, photo, quad },
        await options.corpus(),
        options.runner,
      );
      await fs.mkdir(path.join(options.persistRoot, "crops"), {
        recursive: true,
      });
      await fs.writeFile(
        path.join(options.persistRoot, "crops", `${scanId}.jpg`),
        crop,
      );
      await fs.appendFile(
        path.join(options.persistRoot, "recognitions.ndjson"),
        `${JSON.stringify({
          scanId,
          timestamp: new Date().toISOString(),
          candidates: recognition.candidates,
          decision: recognition.decision,
          stageMs: recognition.stageMs,
          rotation: recognition.rotation,
          serviceLatencyMs: recognition.serviceLatencyMs,
        })}\n`,
      );
      return { status: 200, body: recognition };
    } catch (error) {
      if (error instanceof RectifiedInputError)
        return { status: 400, body: { error: error.message } };
      throw error;
    } finally {
      inFlight = false;
    }
  };
}

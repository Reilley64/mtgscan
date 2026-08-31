import http from "node:http";
import { ZodError } from "zod";
import { RecognitionRequestSchema } from "@scanner-accuracy/shared";
import {
  cacheDefaultCardsBulkMetadata,
  loadCorpus,
  prepareCorpus,
} from "./corpus.js";
import { defaultManifestPath, fullManifestPath } from "./config.js";
import { generateReport, recordOutcome } from "./outcomes.js";
import { personalManifestPath } from "./personal-manifest.js";
import { recognize } from "./recognizer.js";
const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "0.0.0.0";
function reply(response: http.ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  });
  response.end(JSON.stringify(body));
}
async function body(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 50_000_000) throw new Error("request exceeds 50 MB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") return reply(response, 204, {});
  try {
    if (request.method === "GET" && request.url === "/health") {
      let corpusCards = 0;
      try {
        corpusCards = (await loadCorpus()).length;
      } catch {
        /* not prepared */
      }
      return reply(response, 200, {
        status: "ok",
        prototype: true,
        corpusCards,
        ocr: process.env.OCR_ENABLED === "1" ? "enabled" : "disabled",
        finishInference: "unavailable",
      });
    }
    if (request.method === "POST" && request.url === "/corpus/prepare") {
      const input = (await body(request)) as {
        corpus?: "kill" | "benchmark" | "personal";
        cacheBulkMetadata?: boolean;
      };
      const manifestPath =
        input.corpus === "personal"
          ? personalManifestPath
          : input.corpus === "benchmark"
            ? fullManifestPath
            : defaultManifestPath;
      const prepared = await prepareCorpus(manifestPath);
      const bulkMetadataFile = input.cacheBulkMetadata
        ? await cacheDefaultCardsBulkMetadata()
        : null;
      return reply(response, 200, {
        manifest: prepared.manifest,
        cards: prepared.cards.length,
        bulkMetadataFile,
      });
    }
    if (request.method === "POST" && request.url === "/recognitions") {
      const input = RecognitionRequestSchema.parse(await body(request));
      return reply(response, 200, await recognize(input, await loadCorpus()));
    }
    if (request.method === "POST" && request.url === "/outcomes") {
      const recorded = await recordOutcome(await body(request));
      return reply(response, 201, { recorded: recorded.scanId });
    }
    if (request.method === "POST" && request.url === "/reports/generate")
      return reply(response, 200, await generateReport());
    return reply(response, 404, { error: "not found" });
  } catch (error) {
    const detail =
      error instanceof ZodError
        ? error.issues
        : error instanceof Error
          ? error.message
          : String(error);
    return reply(response, error instanceof ZodError ? 400 : 500, {
      error: "request failed",
      detail,
    });
  }
});
server.listen(port, host, () =>
  console.log(
    `Scanner accuracy prototype service listening on http://${host}:${port}`,
  ),
);

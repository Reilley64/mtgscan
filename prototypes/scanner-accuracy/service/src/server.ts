import http from "node:http";
import { ZodError } from "zod";
import { RecognitionRequestSchema } from "@scanner-accuracy/shared";
import { loadCorpus } from "./corpus.js";
import { prototypeToken } from "./config.js";
import {
  generateReport,
  persistRecognition,
  recordOutcome,
} from "./outcomes.js";
import { recognize } from "./recognizer.js";
const port = Number(process.env.PORT ?? 4317);
const host = process.env.HOST ?? "127.0.0.1";
const browserOrigin = process.env.PROTOTYPE_BROWSER_ORIGIN;
prototypeToken();
let recognitionInFlight = false;
function reply(response: http.ServerResponse, status: number, body: unknown) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (browserOrigin) {
    headers["Access-Control-Allow-Origin"] = browserOrigin;
    headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";
    headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
  }
  response.writeHead(status, headers);
  response.end(JSON.stringify(body));
}
function authorized(request: http.IncomingMessage) {
  return request.headers.authorization === `Bearer ${prototypeToken()}`;
}
async function body(request: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 64_000_000) throw new Error("request exceeds 64 MB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}
const server = http.createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    if (!browserOrigin || request.headers.origin !== browserOrigin)
      return reply(response, 403, { error: "origin denied" });
    return reply(response, 204, {});
  }
  try {
    if (request.method === "GET" && request.url === "/health")
      return reply(response, 200, { status: "ok", prototype: true });
    if (!authorized(request))
      return reply(response, 401, { error: "unauthorized" });
    if (request.method === "POST" && request.url === "/recognitions") {
      if (recognitionInFlight)
        return reply(response, 429, { error: "recognition busy; retry later" });
      recognitionInFlight = true;
      try {
        const input = RecognitionRequestSchema.parse(await body(request));
        const result = await recognize(input, await loadCorpus());
        await persistRecognition(result);
        return reply(response, 200, result);
      } finally {
        recognitionInFlight = false;
      }
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

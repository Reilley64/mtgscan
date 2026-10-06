import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import type {
  PhotoRecognitionInput,
  PhotoRecognitionOutput,
} from "./rectified-endpoint.js";

export type CatalogCandidate = {
  scryfallId: string;
  oracleId: string;
  name: string;
  set: string;
  collectorNumber: string;
  score: number;
};

export type CatalogRecognition = {
  scanId: string;
  serviceLatencyMs: number;
  stageMs: Record<string, number>;
  rotation: number;
  topSimilarity: number;
  candidates: CatalogCandidate[];
  decision: { accepted: boolean; scryfallId: string | null; reasons: string[] };
  reading: {
    setCode: string | null;
    collectorNumber: string | null;
    premiumMark: boolean;
    lines: string[];
  };
};

type HelperRecognition = Omit<
  CatalogRecognition,
  "scanId" | "serviceLatencyMs" | "decision" | "reading"
> & {
  decision: { accepted: boolean; scryfallId?: string; reasons: string[] };
  reading: {
    setCode?: string;
    collectorNumber?: string;
    premiumMark: boolean;
    lines: string[];
  };
};

type HelperResponse = {
  requestId: string;
  recognition?: HelperRecognition;
  error?: string;
};

type Helper = {
  send: (request: Record<string, unknown>) => Promise<HelperResponse>;
  stop: () => void;
};

function startHelper(
  binary: string,
  catalogDirectory: string,
  timeoutMs: number,
  onExit: () => void,
): Promise<Helper> {
  const child = spawn(binary, ["serve", catalogDirectory], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const pending = new Map<
    string,
    { resolve: (value: HelperResponse) => void; reject: (error: Error) => void }
  >();
  let ready: (() => void) | undefined;
  let failStart: ((error: Error) => void) | undefined;
  const started = new Promise<void>((resolve, reject) => {
    ready = resolve;
    failStart = reject;
  });
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch {
      return;
    }
    if (typeof message.ready === "number") return ready?.();
    const response = message as HelperResponse;
    const waiter = pending.get(response.requestId);
    if (!waiter) return;
    pending.delete(response.requestId);
    waiter.resolve(response);
  });
  child.on("exit", (code, signal) => {
    const error = new Error(
      `catalog recognizer exited (${code ?? signal ?? "unknown"})`,
    );
    failStart?.(error);
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
    onExit();
  });
  child.on("error", (error) => failStart?.(error));
  let sequence = 0;
  const helper: Helper = {
    send: (request) =>
      new Promise<HelperResponse>((resolve, reject) => {
        const requestId = `r${++sequence}`;
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(
            new Error(`catalog recognizer timed out after ${timeoutMs} ms`),
          );
          child.kill();
        }, timeoutMs);
        pending.set(requestId, {
          resolve: (value) => {
            clearTimeout(timer);
            resolve(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
        child.stdin.write(`${JSON.stringify({ ...request, requestId })}\n`);
      }),
    stop: () => child.kill(),
  };
  return started.then(() => helper);
}

export function createCatalogRecognizer(options: {
  binary: string;
  catalogDirectory: string;
  workDirectory: string;
  timeoutMs: number;
}) {
  let helper: Promise<Helper> | undefined;
  const load = () => {
    helper ??= startHelper(
      options.binary,
      options.catalogDirectory,
      options.timeoutMs,
      () => {
        helper = undefined;
      },
    ).catch((error: unknown) => {
      helper = undefined;
      throw error;
    });
    return helper;
  };
  return {
    warm: async () => {
      await load();
    },
    close: async () => {
      const running = helper;
      helper = undefined;
      (await running?.catch(() => undefined))?.stop();
    },
    recognize: async (
      input: PhotoRecognitionInput,
    ): Promise<
      PhotoRecognitionOutput & { recognition: CatalogRecognition }
    > => {
      const started = performance.now();
      const incoming = path.join(options.workDirectory, "incoming");
      await fs.mkdir(incoming, { recursive: true });
      const photoPath = path.join(incoming, `${input.scanId}.jpg`);
      const cropPath = path.join(incoming, `${input.scanId}-crop.jpg`);
      try {
        await fs.writeFile(photoPath, input.photo);
        const response = await (
          await load()
        ).send({
          photoPath,
          cropOutputPath: cropPath,
          quad: [
            input.quad.topLeft,
            input.quad.topRight,
            input.quad.bottomRight,
            input.quad.bottomLeft,
          ].map((point) => [point.x, point.y]),
        });
        if (!response.recognition)
          throw new Error(response.error ?? "catalog recognizer failed");
        const helperRecognition = response.recognition;
        const crop = await fs.readFile(cropPath).catch(() => undefined);
        const recognition: CatalogRecognition = {
          scanId: input.scanId,
          serviceLatencyMs: Math.round(performance.now() - started),
          stageMs: helperRecognition.stageMs,
          rotation: helperRecognition.rotation,
          topSimilarity: helperRecognition.topSimilarity,
          candidates: helperRecognition.candidates,
          decision: {
            accepted: helperRecognition.decision.accepted,
            scryfallId: helperRecognition.decision.scryfallId ?? null,
            reasons: helperRecognition.decision.reasons,
          },
          reading: {
            setCode: helperRecognition.reading.setCode ?? null,
            collectorNumber: helperRecognition.reading.collectorNumber ?? null,
            premiumMark: helperRecognition.reading.premiumMark,
            lines: helperRecognition.reading.lines,
          },
        };
        const log: Record<string, unknown> = { ...recognition };
        delete log.scanId;
        return { recognition, crop, log };
      } finally {
        await fs.rm(photoPath, { force: true });
        await fs.rm(cropPath, { force: true });
      }
    },
  };
}

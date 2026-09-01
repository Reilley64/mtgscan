import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { GeometricResult } from "./geometric-matcher.js";
import {
  isRerankInput,
  isWorkerMessage,
  type RerankRequest,
} from "./isolated-geometric-protocol.js";
import type { CorpusCard } from "./ranking.js";

const WORKER_START_TIMEOUT_MS = 30_000;
const GRACEFUL_SHUTDOWN_MS = 1_000;
const FORCED_SHUTDOWN_MS = 1_000;

export type IsolatedGeometricWorkerDiagnostic = {
  pid: number;
  generation: number;
  completedReranks: number;
  completedByWorker: number;
  recycleCount: number;
  rssBytes: number;
};

export type IsolatedGeometricResult = GeometricResult & {
  worker: IsolatedGeometricWorkerDiagnostic;
};

export type IsolatedGeometricRerankInput = {
  stillPaths: [string, string, string];
  candidates: CorpusCard[];
  referenceRoot: string;
};

export type IsolatedGeometricRunner = {
  rerank(input: IsolatedGeometricRerankInput): Promise<IsolatedGeometricResult>;
  close(): Promise<void>;
};

type ErrorCode =
  | "GEOMETRIC_RUNNER_INVALID_INPUT"
  | "GEOMETRIC_RUNNER_BUSY"
  | "GEOMETRIC_RUNNER_CLOSED"
  | "GEOMETRIC_WORKER_TIMEOUT"
  | "GEOMETRIC_WORKER_EXIT"
  | "GEOMETRIC_WORKER_PROTOCOL"
  | "GEOMETRIC_WORKER_JOB_FAILED";

export class IsolatedGeometricRunnerError extends Error {
  constructor(
    message: string,
    readonly code: ErrorCode,
  ) {
    super(message);
    this.name = "IsolatedGeometricRunnerError";
  }
}

export class IsolatedGeometricTimeoutError extends IsolatedGeometricRunnerError {
  constructor() {
    super("Geometric worker timed out", "GEOMETRIC_WORKER_TIMEOUT");
    this.name = "IsolatedGeometricTimeoutError";
  }
}

export class IsolatedGeometricExitError extends IsolatedGeometricRunnerError {
  constructor() {
    super("Geometric worker exited unexpectedly", "GEOMETRIC_WORKER_EXIT");
    this.name = "IsolatedGeometricExitError";
  }
}

function positiveFiniteInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

function removeWorkerListeners(child: ChildProcess) {
  child.removeAllListeners("message");
  child.removeAllListeners("error");
  child.removeAllListeners("exit");
}

async function stopWorker(child: ChildProcess, graceful: boolean) {
  if (child.exitCode !== null || child.signalCode !== null) {
    removeWorkerListeners(child);
    return;
  }
  await new Promise<void>((resolve) => {
    let settled = false;
    const timers = new Set<NodeJS.Timeout>();
    const finish = () => {
      if (settled) return;
      settled = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      child.removeListener("exit", finish);
      child.removeListener("error", finish);
      resolve();
    };
    child.once("exit", finish);
    child.once("error", finish);
    if (graceful && child.connected) {
      try {
        child.send({ type: "shutdown" });
      } catch {
        child.kill("SIGTERM");
      }
    } else child.kill("SIGTERM");
    const forceTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    }, GRACEFUL_SHUTDOWN_MS);
    forceTimer.unref();
    timers.add(forceTimer);
    const finalTimer = setTimeout(
      finish,
      GRACEFUL_SHUTDOWN_MS + FORCED_SHUTDOWN_MS,
    );
    finalTimer.unref();
    timers.add(finalTimer);
  });
  removeWorkerListeners(child);
}

export function createIsolatedGeometricRunner(options: {
  maxReranksPerWorker: number;
  timeoutMs: number;
}): IsolatedGeometricRunner {
  if (
    !positiveFiniteInteger(options?.maxReranksPerWorker) ||
    !positiveFiniteInteger(options?.timeoutMs)
  )
    throw new IsolatedGeometricRunnerError(
      "Runner limits must be finite positive integers",
      "GEOMETRIC_RUNNER_INVALID_INPUT",
    );

  let child: ChildProcess | null = null;
  let generation = 0;
  let completedReranks = 0;
  let completedByWorker = 0;
  let recycleCount = 0;
  let inFlight = false;
  let closed = false;
  let closePromise: Promise<void> | undefined;

  async function spawnWorker(): Promise<ChildProcess> {
    if (child && child.exitCode === null && child.signalCode === null)
      return child;
    const spawned = fork(
      fileURLToPath(new URL("./isolated-geometric-worker.ts", import.meta.url)),
      [],
      {
        cwd: process.cwd(),
        execArgv: ["--import", "tsx"],
        serialization: "json",
        stdio: ["ignore", "ignore", "ignore", "ipc"],
      },
    );
    child = spawned;
    generation += 1;
    completedByWorker = 0;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        void stopWorker(spawned, false).then(() =>
          reject(new IsolatedGeometricTimeoutError()),
        );
      }, WORKER_START_TIMEOUT_MS);
      timer.unref();
      const cleanup = () => {
        clearTimeout(timer);
        spawned.removeListener("message", onMessage);
        spawned.removeListener("exit", onExit);
        spawned.removeListener("error", onError);
      };
      const onMessage = (value: unknown) => {
        if (settled || !isWorkerMessage(value)) {
          if (!settled) {
            settled = true;
            cleanup();
            void stopWorker(spawned, false).then(() =>
              reject(
                new IsolatedGeometricRunnerError(
                  "Geometric worker sent an invalid message",
                  "GEOMETRIC_WORKER_PROTOCOL",
                ),
              ),
            );
          }
          return;
        }
        if (value.type === "ready" && value.pid === spawned.pid) {
          settled = true;
          cleanup();
          resolve();
        } else if (value.type === "startup-error") {
          settled = true;
          cleanup();
          void stopWorker(spawned, false).then(() =>
            reject(new IsolatedGeometricExitError()),
          );
        }
      };
      const onExit = () => {
        if (settled) return;
        settled = true;
        cleanup();
        if (child === spawned) child = null;
        reject(new IsolatedGeometricExitError());
      };
      const onError = onExit;
      spawned.on("message", onMessage);
      spawned.once("exit", onExit);
      spawned.once("error", onError);
    });
    return spawned;
  }

  async function rerank(
    input: IsolatedGeometricRerankInput,
  ): Promise<IsolatedGeometricResult> {
    if (closed)
      throw new IsolatedGeometricRunnerError(
        "Geometric runner is closed",
        "GEOMETRIC_RUNNER_CLOSED",
      );
    if (inFlight)
      throw new IsolatedGeometricRunnerError(
        "Geometric runner accepts one rerank at a time",
        "GEOMETRIC_RUNNER_BUSY",
      );
    if (!isRerankInput(input))
      throw new IsolatedGeometricRunnerError(
        "Invalid geometric rerank input",
        "GEOMETRIC_RUNNER_INVALID_INPUT",
      );
    inFlight = true;
    try {
      const active = await spawnWorker();
      if (closed) {
        await stopWorker(active, true);
        if (child === active) child = null;
        throw new IsolatedGeometricRunnerError(
          "Geometric runner is closed",
          "GEOMETRIC_RUNNER_CLOSED",
        );
      }
      const requestId = randomUUID();
      const request: RerankRequest = {
        type: "rerank",
        requestId,
        stillPaths: [...input.stillPaths],
        candidates: input.candidates.map((card) => ({
          scryfallId: card.scryfallId,
          ...(card.oracleId === undefined ? {} : { oracleId: card.oracleId }),
          name: card.name,
          set: card.set,
          collectorNumber: card.collectorNumber,
          language: card.language,
          finishes: [...card.finishes],
          imageHash: card.imageHash,
        })),
        referenceRoot: input.referenceRoot,
      };
      return await new Promise<IsolatedGeometricResult>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          clearTimeout(timer);
          active.removeListener("message", onMessage);
          active.removeListener("exit", onExit);
          active.removeListener("error", onExit);
        };
        const failAndStop = async (error: Error) => {
          if (settled) return;
          settled = true;
          cleanup();
          if (child === active) child = null;
          await stopWorker(active, false);
          reject(error);
        };
        const onMessage = (value: unknown) => {
          if (settled) return;
          if (!isWorkerMessage(value)) {
            void failAndStop(
              new IsolatedGeometricRunnerError(
                "Geometric worker sent an invalid message",
                "GEOMETRIC_WORKER_PROTOCOL",
              ),
            );
            return;
          }
          if (
            (value.type !== "result" && value.type !== "job-error") ||
            value.requestId !== requestId
          ) {
            void failAndStop(
              new IsolatedGeometricRunnerError(
                "Geometric worker sent an unexpected message",
                "GEOMETRIC_WORKER_PROTOCOL",
              ),
            );
            return;
          }
          settled = true;
          cleanup();
          if (value.type === "job-error") {
            reject(new IsolatedGeometricRunnerError(value.message, value.code));
            return;
          }
          completedReranks += 1;
          completedByWorker += 1;
          const shouldRecycle =
            completedByWorker >= options.maxReranksPerWorker;
          if (shouldRecycle) recycleCount += 1;
          const result: IsolatedGeometricResult = {
            ...value.result,
            worker: {
              pid: active.pid!,
              generation,
              completedReranks,
              completedByWorker,
              recycleCount,
              rssBytes: value.result.rssBytes,
            },
          };
          void (async () => {
            if (shouldRecycle) {
              if (child === active) child = null;
              await stopWorker(active, true);
            }
            resolve(result);
          })();
        };
        const onExit = () => {
          if (settled) return;
          settled = true;
          cleanup();
          if (child === active) child = null;
          reject(new IsolatedGeometricExitError());
        };
        const timer = setTimeout(() => {
          void failAndStop(new IsolatedGeometricTimeoutError());
        }, options.timeoutMs);
        timer.unref();
        active.on("message", onMessage);
        active.once("exit", onExit);
        active.once("error", onExit);
        try {
          active.send(request, (error) => {
            if (error) void failAndStop(new IsolatedGeometricExitError());
          });
        } catch {
          void failAndStop(new IsolatedGeometricExitError());
        }
      });
    } finally {
      inFlight = false;
    }
  }

  async function close(): Promise<void> {
    if (closePromise) return closePromise;
    closed = true;
    closePromise = (async () => {
      const active = child;
      child = null;
      if (active) await stopWorker(active, true);
    })();
    return closePromise;
  }

  return { rerank, close };
}

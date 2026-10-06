import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { RerankJob, RerankJobResult } from "./rectified-rerank-worker.js";

export type RectifiedRerankRunner = {
  warm(): Promise<void>;
  rerank(job: Omit<RerankJob, "type" | "requestId">): Promise<RerankJobResult>;
  close(): Promise<void>;
};

type Slot = { worker: Promise<ChildProcess> | null; completed: number };

export function createRectifiedRerankRunner(options: {
  featureRoot: string;
  maxReranksPerWorker: number;
  timeoutMs: number;
  workers?: number;
}): RectifiedRerankRunner {
  const slots: Slot[] = Array.from({ length: options.workers ?? 1 }, () => ({
    worker: null,
    completed: 0,
  }));
  let busy = false;
  let closed = false;

  function start(slot: Slot): Promise<ChildProcess> {
    const child = fork(
      fileURLToPath(new URL("./rectified-rerank-worker.ts", import.meta.url)),
      [options.featureRoot],
      {
        execArgv: ["--import", "tsx"],
        serialization: "advanced",
        stdio: ["ignore", "ignore", "inherit", "ipc"],
      },
    );
    slot.completed = 0;
    const ready = new Promise<ChildProcess>((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("rerank worker did not start"));
      }, 60_000);
      child.once("message", (message: { type?: string }) => {
        clearTimeout(timer);
        if (message?.type === "ready") resolve(child);
        else {
          child.kill("SIGKILL");
          reject(new Error("rerank worker sent an unexpected message"));
        }
      });
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("rerank worker exited during startup"));
      });
    });
    ready.catch(() => undefined);
    child.once("exit", () => {
      if (slot.worker === ready) slot.worker = null;
    });
    slot.worker = ready;
    return ready;
  }

  function stop(child: ChildProcess) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const forced = setTimeout(() => child.kill("SIGKILL"), 2_000);
    forced.unref();
    child.once("exit", () => clearTimeout(forced));
    if (child.connected) child.send({ type: "shutdown" });
    else child.kill("SIGTERM");
  }

  async function run(
    slot: Slot,
    job: Omit<RerankJob, "type" | "requestId">,
  ): Promise<RerankJobResult> {
    const child = await (slot.worker ?? start(slot));
    const requestId = randomUUID();
    const result = await new Promise<RerankJobResult>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        child.off("message", onMessage);
        child.off("exit", onExit);
      };
      const onMessage = (message: { type?: string; requestId?: string }) => {
        if (message?.requestId !== requestId) return;
        cleanup();
        if (message.type === "result") resolve(message as RerankJobResult);
        else reject(new Error("rerank worker job failed"));
      };
      const onExit = () => {
        cleanup();
        reject(new Error("rerank worker exited"));
      };
      const timer = setTimeout(() => {
        cleanup();
        child.kill("SIGKILL");
        reject(new Error("rerank worker timed out"));
      }, options.timeoutMs);
      child.on("message", onMessage);
      child.once("exit", onExit);
      child.send({ type: "rerank", requestId, ...job });
    });
    slot.completed += 1;
    if (slot.completed >= options.maxReranksPerWorker) {
      start(slot);
      stop(child);
    }
    return result;
  }

  return {
    async warm() {
      if (closed) throw new Error("rerank runner is closed");
      await Promise.all(slots.map((slot) => slot.worker ?? start(slot)));
    },
    async rerank(job) {
      if (closed) throw new Error("rerank runner is closed");
      if (busy) throw new Error("rerank runner is busy");
      busy = true;
      try {
        const shares = slots.map((_, slot) =>
          job.scryfallIds.filter((_, index) => index % slots.length === slot),
        );
        const results = await Promise.all(
          slots.map((slot, index) =>
            shares[index]!.length
              ? run(slot, { ...job, scryfallIds: shares[index]! })
              : null,
          ),
        );
        const evidence = new Map(
          results
            .flatMap((result) => result?.evidence ?? [])
            .map((item) => [item.scryfallId, item]),
        );
        return {
          type: "result",
          requestId: randomUUID(),
          queryFeatures: results[0]?.queryFeatures ?? 0,
          evidence: job.scryfallIds.map((id) => evidence.get(id)!),
        };
      } finally {
        busy = false;
      }
    },
    async close() {
      closed = true;
      await Promise.all(
        slots.map(async (slot) => {
          const current = slot.worker;
          slot.worker = null;
          const child = await current?.catch(() => null);
          if (!child) return;
          await new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) resolve();
            else {
              child.once("exit", () => resolve());
              stop(child);
            }
          });
        }),
      );
    },
  };
}

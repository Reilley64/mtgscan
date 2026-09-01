import fs from "node:fs/promises";
import {
  clearGeometricReferenceCache,
  initializeGeometricMatcher,
  rerankGeometrically,
} from "./geometric-matcher.js";
import {
  isParentMessage,
  SANITIZED_FRAME_ERROR,
  type ParentMessage,
  type WorkerMessage,
} from "./isolated-geometric-protocol.js";

function send(message: WorkerMessage, callback?: () => void) {
  if (process.connected && process.send) {
    if (callback) process.send(message, () => callback());
    else process.send(message);
  } else callback?.();
}

let working = false;
let shuttingDown = false;

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  clearGeometricReferenceCache();
  process.removeAllListeners("message");
  if (process.connected) process.disconnect?.();
  process.exit(0);
}

process.on("message", async (value: unknown) => {
  if (!isParentMessage(value)) {
    await shutdown();
    return;
  }
  const message: ParentMessage = value;
  if (message.type === "shutdown") {
    if (!working) await shutdown();
    return;
  }
  if (working || shuttingDown) {
    await shutdown();
    return;
  }
  working = true;
  try {
    const stills = await Promise.all(
      message.stillPaths.map((stillPath) => fs.readFile(stillPath)),
    );
    const result = await rerankGeometrically(
      stills as [Buffer, Buffer, Buffer],
      message.candidates,
      { referenceRoot: message.referenceRoot },
    );
    send({
      type: "result",
      requestId: message.requestId,
      result: {
        ...result,
        candidates: result.candidates.map((candidate) => ({
          ...candidate,
          frames: candidate.frames.map((frame) => ({
            keypoints: frame.keypoints,
            goodMatches: frame.goodMatches,
            inliers: frame.inliers,
            inlierRatio: frame.inlierRatio,
            homographyValid: frame.homographyValid,
            quadValid: frame.quadValid,
            areaFraction: frame.areaFraction,
            ...(frame.error === undefined
              ? {}
              : { error: SANITIZED_FRAME_ERROR }),
          })),
        })),
      },
    });
  } catch {
    send({
      type: "job-error",
      requestId: message.requestId,
      code: "GEOMETRIC_WORKER_JOB_FAILED",
      message: "Geometric worker failed",
    });
  } finally {
    working = false;
    if (shuttingDown) await shutdown();
  }
});

try {
  await initializeGeometricMatcher();
  send({ type: "ready", pid: process.pid });
} catch {
  send({ type: "startup-error" }, () => process.exit(1));
}

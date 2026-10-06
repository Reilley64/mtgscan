import fs from "node:fs/promises";
import path from "node:path";
import {
  descriptorMat,
  loadOpenCv,
  matchReference,
  orbFeatures,
  QUERY_FEATURES,
  type GeometricEvidence,
  type OrbFeatures,
} from "./rectified-features.js";
import type { RectifiedCorpusIndex } from "./rectified-corpus.js";

export type RerankJob = {
  type: "rerank";
  requestId: string;
  gray: Uint8Array;
  width: number;
  height: number;
  cardWindow: { left: number; top: number; width: number; height: number };
  scryfallIds: string[];
};
export type RerankJobResult = {
  type: "result";
  requestId: string;
  queryFeatures: number;
  evidence: Array<GeometricEvidence & { scryfallId: string }>;
};

function send(message: unknown) {
  if (process.connected && process.send) process.send(message);
}

const featureRoot = process.argv[2]!;
const cv = await loadOpenCv();
const index = JSON.parse(
  await fs.readFile(path.join(featureRoot, "corpus.json"), "utf8"),
) as RectifiedCorpusIndex;
const pointBytes = await fs.readFile(path.join(featureRoot, "orb-points.bin"));
const points = new Float32Array(
  pointBytes.buffer.slice(
    pointBytes.byteOffset,
    pointBytes.byteOffset + pointBytes.length,
  ),
);
const descriptors = new Uint8Array(
  await fs.readFile(path.join(featureRoot, "orb-descriptors.bin")),
);
const references = new Map<string, OrbFeatures>(
  index.cards.map((card) => [
    card.scryfallId,
    {
      points: points.subarray(
        card.featureStart * 2,
        (card.featureStart + card.featureCount) * 2,
      ),
      descriptors: descriptors.subarray(
        card.featureStart * 32,
        (card.featureStart + card.featureCount) * 32,
      ),
    },
  ]),
);
let working = false;

process.on("message", (message: RerankJob | { type: "shutdown" }) => {
  if (message?.type === "shutdown") {
    if (!working) process.exit(0);
    return;
  }
  if (message?.type !== "rerank" || working) process.exit(1);
  working = true;
  let queryDescriptors: any;
  try {
    const query = orbFeatures(
      cv,
      new Uint8Array(message.gray),
      message.width,
      message.height,
      QUERY_FEATURES,
    );
    queryDescriptors = descriptorMat(cv, query);
    const evidence = message.scryfallIds.map((scryfallId) => {
      const reference = references.get(scryfallId);
      return {
        scryfallId,
        ...(reference
          ? matchReference(
              cv,
              query,
              queryDescriptors,
              message.cardWindow,
              { width: message.width, height: message.height },
              reference,
            )
          : {
              goodMatches: 0,
              inliers: 0,
              inlierRatio: 0,
              plausible: false,
              inlierCells: [],
            }),
      };
    });
    send({
      type: "result",
      requestId: message.requestId,
      queryFeatures: query.points.length / 2,
      evidence,
    } satisfies RerankJobResult);
  } catch {
    send({ type: "job-error", requestId: message.requestId });
  } finally {
    queryDescriptors?.delete?.();
    working = false;
  }
});

process.on("disconnect", () => process.exit(0));
send({ type: "ready", pid: process.pid });

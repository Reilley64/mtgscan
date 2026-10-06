import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  grayscale,
  loadOpenCv,
  orbFeatures,
  REFERENCE_FEATURES,
} from "../src/rectified-features.js";
import {
  createRectifiedRerankRunner,
  type RectifiedRerankRunner,
} from "../src/rectified-rerank-runner.js";
import { CARD_HEIGHT, CARD_WIDTH } from "../src/rectify.js";

const runners: RectifiedRerankRunner[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(runners.splice(0).map((runner) => runner.close()));
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

function patternedCard(label: string, seed: number) {
  const lines = Array.from(
    { length: 30 },
    (_, index) =>
      `<path d="M${(index * 37 * seed) % CARD_WIDTH} 0 L${CARD_WIDTH - ((index * 19 * seed) % CARD_WIDTH)} ${CARD_HEIGHT}" stroke="#${((index * 712345 * seed) % 0xffffff).toString(16).padStart(6, "0")}" stroke-width="${2 + (index % 5)}"/>`,
  ).join("");
  return `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="#e8d4a0"/>${lines}<text x="35" y="100" font-size="60" font-family="serif">${label}</text><text x="40" y="620" font-size="34">0123456789 ${label}</text></svg>`;
}

async function featureFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rectified-runner-"));
  roots.push(root);
  const cv = await loadOpenCv();
  const cards = [];
  const points: Uint8Array[] = [];
  const descriptors: Uint8Array[] = [];
  let featureStart = 0;
  for (const [id, seed] of [
    ["right", 3],
    ["wrong", 7],
  ] as const) {
    const rgb = await sharp(Buffer.from(patternedCard(id.toUpperCase(), seed)))
      .removeAlpha()
      .raw()
      .toBuffer();
    const features = orbFeatures(
      cv,
      grayscale(rgb),
      CARD_WIDTH,
      CARD_HEIGHT,
      REFERENCE_FEATURES,
    );
    const featureCount = features.points.length / 2;
    cards.push({
      scryfallId: id,
      oracleId: "same",
      illustrationId: null,
      name: "Same Name",
      set: "tst",
      collectorNumber: id,
      featureStart,
      featureCount,
    });
    featureStart += featureCount;
    points.push(new Uint8Array(features.points.buffer));
    descriptors.push(features.descriptors);
  }
  await fs.writeFile(
    path.join(root, "corpus.json"),
    JSON.stringify({ createdAt: "test", descriptorLength: 0, cards }),
  );
  await fs.writeFile(path.join(root, "orb-points.bin"), Buffer.concat(points));
  await fs.writeFile(
    path.join(root, "orb-descriptors.bin"),
    Buffer.concat(descriptors),
  );
  const width = Math.round(CARD_WIDTH * 1.2),
    height = Math.round(CARD_HEIGHT * 1.2);
  const cardWindow = {
    left: Math.round(CARD_WIDTH * 0.1),
    top: Math.round(CARD_HEIGHT * 0.1),
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };
  const query = await sharp({
    create: { width, height, channels: 3, background: "#303030" },
  })
    .composite([
      {
        input: Buffer.from(patternedCard("RIGHT", 3)),
        left: cardWindow.left,
        top: cardWindow.top,
      },
    ])
    .removeAlpha()
    .raw()
    .toBuffer();
  return {
    root,
    job: {
      gray: grayscale(query),
      width,
      height,
      cardWindow,
      scryfallIds: ["wrong", "right", "missing"],
    },
  };
}

describe("isolated rectified reranker", () => {
  it("verifies the matching printing across recycled workers", async () => {
    const { root, job } = await featureFixture();
    const runner = createRectifiedRerankRunner({
      featureRoot: root,
      maxReranksPerWorker: 1,
      timeoutMs: 20_000,
    });
    runners.push(runner);
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await runner.rerank(job);
      const byId = new Map(
        result.evidence.map((evidence) => [evidence.scryfallId, evidence]),
      );
      expect(byId.get("right")!.plausible).toBe(true);
      expect(byId.get("right")!.inliers).toBeGreaterThan(
        2 * byId.get("wrong")!.inliers + 20,
      );
      expect(byId.get("missing")).toEqual({
        scryfallId: "missing",
        goodMatches: 0,
        inliers: 0,
        inlierRatio: 0,
        plausible: false,
        inlierCells: [],
      });
    }
  }, 60_000);

  it("refuses a second concurrent rerank and closes idempotently", async () => {
    const { root, job } = await featureFixture();
    const runner = createRectifiedRerankRunner({
      featureRoot: root,
      maxReranksPerWorker: 5,
      timeoutMs: 20_000,
    });
    runners.push(runner);
    await runner.warm();
    const first = runner.rerank(job);
    await expect(runner.rerank(job)).rejects.toThrow("busy");
    await first;
    await runner.close();
    await runner.close();
    await expect(runner.rerank(job)).rejects.toThrow("closed");
  }, 60_000);
});

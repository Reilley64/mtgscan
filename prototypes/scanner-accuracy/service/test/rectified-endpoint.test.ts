import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { createRectifiedRecognitionHandler } from "../src/rectified-endpoint.js";
import {
  appearanceDescriptors,
  DESCRIPTOR_LENGTH,
  EDGE_DESCRIPTOR_LENGTH,
  edgeDescriptors,
} from "../src/rectified-ranking.js";
import type { RectifiedCorpus } from "../src/rectified-corpus.js";
import type { RectifiedRerankRunner } from "../src/rectified-rerank-runner.js";
import type { RerankJob } from "../src/rectified-rerank-worker.js";
import { CARD_HEIGHT, CARD_WIDTH } from "../src/rectify.js";

const servers: http.Server[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((resolve) => server.close(resolve))),
  );
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

async function cardImage(fill: string, label: string) {
  return sharp(
    Buffer.from(
      `<svg width="${CARD_WIDTH}" height="${CARD_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect width="${CARD_WIDTH}" height="${CARD_HEIGHT}" fill="${fill}"/><rect x="40" y="80" width="400" height="300" fill="#222"/><text x="40" y="560" font-size="64">${label}</text></svg>`,
    ),
  )
    .removeAlpha()
    .raw()
    .toBuffer();
}

async function fixture(rerank: RectifiedRerankRunner["rerank"]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rectified-endpoint-"));
  roots.push(root);
  const cards = [
    ["right", "#c03030", "RIGHT"],
    ["other", "#3030c0", "OTHER"],
    ["third", "#30c030", "THIRD"],
  ] as const;
  const color = new Float32Array(cards.length * DESCRIPTOR_LENGTH);
  const edge = new Float32Array(cards.length * EDGE_DESCRIPTOR_LENGTH);
  const whole = { left: 0, top: 0, width: CARD_WIDTH, height: CARD_HEIGHT };
  for (const [index, [, fill, label]] of cards.entries()) {
    const rgb = await cardImage(fill, label);
    color.set(
      appearanceDescriptors(rgb, CARD_WIDTH, CARD_HEIGHT, [whole])[0]!,
      index * DESCRIPTOR_LENGTH,
    );
    edge.set(
      edgeDescriptors(rgb, CARD_WIDTH, CARD_HEIGHT, whole, [whole])[0]!,
      index * EDGE_DESCRIPTOR_LENGTH,
    );
  }
  const indexed = cards.map(([id]) => ({
    scryfallId: id,
    oracleId: `oracle-${id}`,
    illustrationId: null,
    name: id,
    set: "tst",
    collectorNumber: "1",
    featureStart: 0,
    featureCount: 0,
  }));
  const corpus: RectifiedCorpus = {
    cards: indexed,
    catalog: indexed,
    appearance: { color, edge },
  };
  const handler = createRectifiedRecognitionHandler({
    corpus: async () => corpus,
    runner: {
      warm: async () => undefined,
      close: async () => undefined,
      rerank,
    },
    persistRoot: root,
  });
  const server = http.createServer(async (request, response) => {
    const result = await handler(request);
    response.writeHead(result.status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result.body));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return { root, url: `http://127.0.0.1:${port}/rectified-recognitions` };
}

const photoQuad = {
  topLeft: { x: 0.25, y: 0.2 },
  topRight: { x: 0.75, y: 0.2 },
  bottomRight: { x: 0.75, y: 0.8 },
  bottomLeft: { x: 0.25, y: 0.8 },
};

async function photo() {
  return sharp({
    create: { width: 976, height: 1133, channels: 3, background: "#808080" },
  })
    .composite([
      {
        input: await sharp(await cardImage("#c03030", "RIGHT"), {
          raw: { width: CARD_WIDTH, height: CARD_HEIGHT, channels: 3 },
        })
          .png()
          .toBuffer(),
        left: 244,
        top: 227,
      },
    ])
    .jpeg()
    .toBuffer();
}

const cells = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, index) => from + index);

const rerankFavoring =
  (winner: string): RectifiedRerankRunner["rerank"] =>
  async (job) => ({
    type: "result",
    requestId: "test",
    queryFeatures: 100,
    evidence: job.scryfallIds.map((scryfallId) => ({
      scryfallId,
      goodMatches: 100,
      inliers: scryfallId === winner ? 90 : 10,
      inlierRatio: 0.5,
      plausible: true,
      inlierCells: scryfallId === winner ? cells(0, 40) : cells(0, 5),
    })),
  });

function post(url: string, body: Buffer, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
      "X-Scan-Id": "scan_1",
      "X-Card-Quad": JSON.stringify(photoQuad),
      ...headers,
    },
    body: new Uint8Array(body),
  });
}

describe("POST /rectified-recognitions", () => {
  it("returns ranked candidates and persists only the rectified crop and one log line", async () => {
    const jobs: Array<Omit<RerankJob, "type" | "requestId">> = [];
    const favor = rerankFavoring("right");
    const { root, url } = await fixture(async (job) => {
      jobs.push(job);
      return favor(job);
    });
    const response = await post(url, await photo());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.scanId).toBe("scan_1");
    expect(Object.keys(body.stageMs).sort()).toEqual([
      "decode",
      "rank",
      "rectify",
      "rerank",
    ]);
    expect(
      body.candidates.map((card: { scryfallId: string }) => card.scryfallId),
    ).toHaveLength(3);
    expect(body.candidates[0]).toEqual({
      scryfallId: "right",
      oracleId: "oracle-right",
      name: "right",
      set: "tst",
      collectorNumber: "1",
      score: 90,
    });
    expect(body.decision).toEqual({
      accepted: true,
      scryfallId: "right",
      reasons: [],
    });
    expect(jobs[0]!.width * jobs[0]!.height).toBe(jobs[0]!.gray.length);
    expect(jobs[0]!.cardWindow.width).toBe(CARD_WIDTH);
    expect((await fs.readdir(root)).sort()).toEqual([
      "crops",
      "recognitions.ndjson",
    ]);
    expect(await fs.readdir(path.join(root, "crops"))).toEqual(["scan_1.jpg"]);
    const crop = await sharp(path.join(root, "crops", "scan_1.jpg")).metadata();
    expect([crop.format, crop.width, crop.height]).toEqual([
      "jpeg",
      CARD_WIDTH,
      CARD_HEIGHT,
    ]);
    const lines = (
      await fs.readFile(path.join(root, "recognitions.ndjson"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(lines).toHaveLength(1);
    expect(lines[0].printingCheck).toBeNull();
    expect(Object.keys(lines[0]).sort()).toEqual([
      "candidates",
      "decision",
      "printingCheck",
      "rotation",
      "scanId",
      "serviceLatencyMs",
      "stageMs",
      "timestamp",
    ]);
  });

  it("abstains when the reranker cannot separate two printings", async () => {
    const { url } = await fixture(async (job) => ({
      ...(await rerankFavoring("right")(job)),
      evidence: job.scryfallIds.map((scryfallId) => ({
        scryfallId,
        goodMatches: 100,
        inliers: 80,
        inlierRatio: 0.5,
        plausible: true,
        inlierCells: cells(0, 40),
      })),
    }));
    const body = await (await post(url, await photo())).json();
    expect(body.decision.accepted).toBe(false);
    expect(body.decision.scryfallId).toBeNull();
  });

  it.each([
    ["a non-JPEG content type", { "Content-Type": "image/png" }, 415],
    ["an invalid scan ID", { "X-Scan-Id": "../escape" }, 400],
    [
      "a non-convex quad",
      {
        "X-Card-Quad": JSON.stringify({
          ...photoQuad,
          bottomRight: photoQuad.bottomLeft,
          bottomLeft: photoQuad.bottomRight,
        }),
      },
      400,
    ],
  ])("rejects %s before recognition", async (_label, headers, status) => {
    let calls = 0;
    const { root, url } = await fixture(async (job) => {
      calls += 1;
      return rerankFavoring("right")(job);
    });
    const response = await post(url, await photo(), headers);
    expect(response.status).toBe(status);
    expect(calls).toBe(0);
    expect(await fs.readdir(root)).toEqual([]);
  });

  it("rejects bodies without a JPEG signature and bodies over 12 MB", async () => {
    const { url } = await fixture(rerankFavoring("right"));
    expect((await post(url, Buffer.from("not a jpeg at all"))).status).toBe(
      400,
    );
    const oversized = Buffer.alloc(12_000_001, 0xff);
    expect((await post(url, oversized)).status).toBe(413);
  });

  it("returns 429 while a recognition is in flight", async () => {
    let release!: () => void;
    let started!: () => void;
    const running = new Promise<void>((resolve) => (started = resolve));
    const { url } = await fixture(async (job) => {
      started();
      await new Promise<void>((resolve) => (release = resolve));
      return rerankFavoring("right")(job);
    });
    const image = await photo();
    const first = post(url, image);
    await running;
    expect((await post(url, image, { "X-Scan-Id": "scan_2" })).status).toBe(
      429,
    );
    release();
    expect((await first).status).toBe(200);
  });
});

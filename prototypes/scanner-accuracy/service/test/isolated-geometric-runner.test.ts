import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  createIsolatedGeometricRunner,
  type IsolatedGeometricRunner,
} from "../src/isolated-geometric-runner.js";
import {
  clearGeometricReferenceCache,
  rerankGeometrically,
} from "../src/geometric-matcher.js";
import type { CorpusCard } from "../src/ranking.js";

const runners: IsolatedGeometricRunner[] = [];
const fixtureRoots: string[] = [];

const card = (id: string): CorpusCard => ({
  scryfallId: id,
  oracleId: "oracle",
  name: "Same Name",
  set: "tst",
  collectorNumber: id,
  language: "en",
  finishes: ["nonfoil"],
  imageHash: "00",
});

async function patternedCard(label: string) {
  const lines = Array.from(
    { length: 24 },
    (_, index) =>
      `<path d="M${(index * 37) % 630} 0 L${630 - ((index * 19) % 630)} 880" stroke="#${((index * 712345) % 0xffffff).toString(16).padStart(6, "0")}" stroke-width="${2 + (index % 5)}"/>`,
  ).join("");
  return sharp(
    Buffer.from(
      `<svg width="630" height="880" xmlns="http://www.w3.org/2000/svg"><rect width="630" height="880" fill="#e8d4a0"/>${lines}<text x="35" y="120" font-size="72" font-family="serif">${label}</text><text x="50" y="700" font-size="40">0123456789 ${label}</text></svg>`,
    ),
  )
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function createFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "isolated-geometric-"));
  fixtureRoots.push(root);
  const referenceRoot = path.join(root, "references");
  await fs.mkdir(referenceRoot);
  const right = card("right");
  const wrong = card("wrong");
  const rightImage = await patternedCard("RIGHT");
  await fs.writeFile(path.join(referenceRoot, "right.jpg"), rightImage);
  await fs.writeFile(
    path.join(referenceRoot, "wrong.jpg"),
    await patternedCard("WRONG"),
  );
  const rightPaths = await Promise.all(
    ["01-right.jpg", "02-right.jpg", "03-right.jpg"].map(async (name) => {
      const file = path.join(root, name);
      await fs.writeFile(file, rightImage);
      return file;
    }),
  );
  const blankImage = await sharp({
    create: { width: 630, height: 880, channels: 3, background: "white" },
  })
    .jpeg()
    .toBuffer();
  const blankPaths = await Promise.all(
    ["01-blank.jpg", "02-blank.jpg", "03-blank.jpg"].map(async (name) => {
      const file = path.join(root, name);
      await fs.writeFile(file, blankImage);
      return file;
    }),
  );
  return {
    referenceRoot,
    candidates: [wrong, right],
    rightImage,
    blankImage,
    rightPaths: rightPaths as [string, string, string],
    blankPaths: blankPaths as [string, string, string],
  };
}

afterEach(async () => {
  clearGeometricReferenceCache();
  await Promise.all(runners.splice(0).map((runner) => runner.close()));
  await Promise.all(
    fixtureRoots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

describe("isolated geometric runner", () => {
  it("matches direct ranking and abstention behavior, then recycles the worker", async () => {
    const fixture = await createFixture();
    const directRanked = await rerankGeometrically(
      [fixture.rightImage, fixture.rightImage, fixture.rightImage],
      fixture.candidates,
      { referenceRoot: fixture.referenceRoot },
    );
    const directBlank = await rerankGeometrically(
      [fixture.blankImage, fixture.blankImage, fixture.blankImage],
      fixture.candidates,
      { referenceRoot: fixture.referenceRoot },
    );
    const runner = createIsolatedGeometricRunner({
      maxReranksPerWorker: 2,
      timeoutMs: 10_000,
    });
    runners.push(runner);

    const ranked = await runner.rerank({
      stillPaths: fixture.rightPaths,
      candidates: fixture.candidates,
      referenceRoot: fixture.referenceRoot,
    });
    const blank = await runner.rerank({
      stillPaths: fixture.blankPaths,
      candidates: fixture.candidates,
      referenceRoot: fixture.referenceRoot,
    });
    const afterRecycle = await runner.rerank({
      stillPaths: fixture.rightPaths,
      candidates: fixture.candidates,
      referenceRoot: fixture.referenceRoot,
    });

    expect(ranked.acceptedScryfallId).toBe(directRanked.acceptedScryfallId);
    expect(ranked.candidates.map((item) => item.card.scryfallId)).toEqual(
      directRanked.candidates.map((item) => item.card.scryfallId),
    );
    expect(blank.acceptedScryfallId).toBe(directBlank.acceptedScryfallId);
    expect(ranked.worker.generation).toBe(1);
    expect(blank.worker).toMatchObject({
      generation: 1,
      completedReranks: 2,
      recycleCount: 1,
    });
    expect(afterRecycle.acceptedScryfallId).toBe("right");
    expect(afterRecycle.worker.generation).toBe(2);
    expect(afterRecycle.worker.pid).not.toBe(ranked.worker.pid);
  }, 30_000);
  it("terminates a timed-out worker and respawns for the next rerank", async () => {
    const fixture = await createFixture();
    const tiny = card("tiny");
    const tinyImage = await sharp({
      create: { width: 48, height: 67, channels: 3, background: "white" },
    })
      .jpeg()
      .toBuffer();
    await fs.writeFile(path.join(fixture.referenceRoot, "tiny.jpg"), tinyImage);
    const tinyPaths = await Promise.all(
      ["01-tiny.jpg", "02-tiny.jpg", "03-tiny.jpg"].map(async (name) => {
        const file = path.join(path.dirname(fixture.referenceRoot), name);
        await fs.writeFile(file, tinyImage);
        return file;
      }),
    );
    const runner = createIsolatedGeometricRunner({
      maxReranksPerWorker: 20,
      timeoutMs: 100,
    });
    runners.push(runner);
    const beforeTimeout = await runner.rerank({
      stillPaths: tinyPaths as [string, string, string],
      candidates: [tiny],
      referenceRoot: fixture.referenceRoot,
    });

    await expect(
      runner.rerank({
        stillPaths: fixture.rightPaths,
        candidates: fixture.candidates,
        referenceRoot: fixture.referenceRoot,
      }),
    ).rejects.toMatchObject({
      name: "IsolatedGeometricTimeoutError",
      code: "GEOMETRIC_WORKER_TIMEOUT",
    });
    expect(() => process.kill(beforeTimeout.worker.pid, 0)).toThrow();

    const afterTimeout = await runner.rerank({
      stillPaths: tinyPaths as [string, string, string],
      candidates: [tiny],
      referenceRoot: fixture.referenceRoot,
    });
    expect(afterTimeout.worker.generation).toBe(2);
    expect(afterTimeout.worker.pid).not.toBe(beforeTimeout.worker.pid);
  }, 30_000);

  it("rejects an in-flight job when its worker exits and respawns afterward", async () => {
    const fixture = await createFixture();
    const runner = createIsolatedGeometricRunner({
      maxReranksPerWorker: 20,
      timeoutMs: 10_000,
    });
    runners.push(runner);
    const first = await runner.rerank({
      stillPaths: fixture.blankPaths,
      candidates: fixture.candidates,
      referenceRoot: fixture.referenceRoot,
    });

    const interrupted = runner.rerank({
      stillPaths: fixture.rightPaths,
      candidates: fixture.candidates,
      referenceRoot: fixture.referenceRoot,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    process.kill(first.worker.pid, "SIGKILL");
    await expect(interrupted).rejects.toMatchObject({
      name: "IsolatedGeometricExitError",
      code: "GEOMETRIC_WORKER_EXIT",
    });

    const afterExit = await runner.rerank({
      stillPaths: fixture.blankPaths,
      candidates: fixture.candidates,
      referenceRoot: fixture.referenceRoot,
    });
    expect(afterExit.worker.generation).toBe(2);
    expect(afterExit.worker.pid).not.toBe(first.worker.pid);
  }, 30_000);

  it("closes idempotently, exits the process, and rejects later work", async () => {
    const fixture = await createFixture();
    const runner = createIsolatedGeometricRunner({
      maxReranksPerWorker: 20,
      timeoutMs: 10_000,
    });
    runners.push(runner);
    const result = await runner.rerank({
      stillPaths: fixture.blankPaths,
      candidates: fixture.candidates,
      referenceRoot: fixture.referenceRoot,
    });

    await Promise.all([runner.close(), runner.close()]);
    expect(() => process.kill(result.worker.pid, 0)).toThrow();
    await expect(
      runner.rerank({
        stillPaths: fixture.blankPaths,
        candidates: fixture.candidates,
        referenceRoot: fixture.referenceRoot,
      }),
    ).rejects.toMatchObject({ code: "GEOMETRIC_RUNNER_CLOSED" });
  });

  it("validates limits and input and rejects concurrent reranks", async () => {
    expect(() =>
      createIsolatedGeometricRunner({
        maxReranksPerWorker: Number.NaN,
        timeoutMs: 10_000,
      }),
    ).toThrowError(
      expect.objectContaining({ code: "GEOMETRIC_RUNNER_INVALID_INPUT" }),
    );
    const fixture = await createFixture();
    const runner = createIsolatedGeometricRunner({
      maxReranksPerWorker: 20,
      timeoutMs: 10_000,
    });
    runners.push(runner);
    await expect(
      runner.rerank({
        stillPaths: fixture.rightPaths.slice(0, 2) as [string, string, string],
        candidates: fixture.candidates,
        referenceRoot: fixture.referenceRoot,
      }),
    ).rejects.toMatchObject({ code: "GEOMETRIC_RUNNER_INVALID_INPUT" });
    await expect(
      runner.rerank({
        stillPaths: fixture.rightPaths,
        candidates: [],
        referenceRoot: fixture.referenceRoot,
      }),
    ).rejects.toMatchObject({ code: "GEOMETRIC_RUNNER_INVALID_INPUT" });
    await expect(
      runner.rerank({
        stillPaths: fixture.rightPaths,
        candidates: fixture.candidates,
        referenceRoot: "",
      }),
    ).rejects.toMatchObject({ code: "GEOMETRIC_RUNNER_INVALID_INPUT" });

    const first = runner.rerank({
      stillPaths: fixture.rightPaths,
      candidates: fixture.candidates,
      referenceRoot: fixture.referenceRoot,
    });
    await expect(
      runner.rerank({
        stillPaths: fixture.rightPaths,
        candidates: fixture.candidates,
        referenceRoot: fixture.referenceRoot,
      }),
    ).rejects.toMatchObject({ code: "GEOMETRIC_RUNNER_BUSY" });
    await first;
  });
});

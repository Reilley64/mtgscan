import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCatalogRecognizer } from "../src/catalog-recognizer.js";

const roots: string[] = [];
const recognizers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(
    recognizers.splice(0).map((recognizer) => recognizer.close()),
  );
  await Promise.all(
    roots
      .splice(0)
      .map((root) => fs.rm(root, { recursive: true, force: true })),
  );
});

const quad = {
  topLeft: { x: 0.2, y: 0.1 },
  topRight: { x: 0.8, y: 0.1 },
  bottomRight: { x: 0.8, y: 0.9 },
  bottomLeft: { x: 0.2, y: 0.9 },
};

async function stubHelper(behaviour: "answer" | "crash" | "silent") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "catalog-recognizer-"));
  roots.push(root);
  const log = path.join(root, "requests.ndjson");
  const script = path.join(root, "helper.mjs");
  await fs.writeFile(
    script,
    `#!/usr/bin/env node
import fs from "node:fs";
import readline from "node:readline";
console.log(JSON.stringify({ ready: 1 }));
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const request = JSON.parse(line);
  fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ ...request, photoExists: fs.existsSync(request.photoPath) }) + "\\n");
  if (${JSON.stringify(behaviour)} === "crash") process.exit(3);
  if (${JSON.stringify(behaviour)} === "silent") return;
  fs.writeFileSync(request.cropOutputPath, "crop-bytes");
  console.log(JSON.stringify({
    requestId: request.requestId,
    recognition: {
      candidates: [{ scryfallId: "a", oracleId: "o", name: "Card", set: "eld", collectorNumber: "8", score: 0.9 }],
      decision: { accepted: true, scryfallId: "a", reasons: ["collector line ELD 8 matches a card in the image shortlist"] },
      reading: { setCode: "eld", collectorNumber: "8", premiumMark: false, lines: ["008/269 R", "ELD • EN"] },
      rotation: 0,
      topSimilarity: 0.9,
      stageMs: { embed: 5 },
    },
  }));
});
`,
  );
  await fs.chmod(script, 0o755);
  const recognizer = createCatalogRecognizer({
    binary: script,
    catalogDirectory: root,
    workDirectory: root,
    timeoutMs: 1_000,
  });
  recognizers.push(recognizer);
  return { root, log, recognizer };
}

const readRequests = async (log: string) =>
  (await fs.readFile(log, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);

describe("catalog recognizer", () => {
  it("sends the photo and quad, returns the app contract, and removes the photo", async () => {
    const { root, log, recognizer } = await stubHelper("answer");
    const result = await recognizer.recognize({
      scanId: "scan_1",
      photo: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
      quad,
    });
    expect(result.recognition).toMatchObject({
      scanId: "scan_1",
      decision: { accepted: true, scryfallId: "a" },
      reading: { setCode: "eld", collectorNumber: "8" },
      candidates: [{ scryfallId: "a", set: "eld" }],
    });
    expect(result.crop?.toString()).toBe("crop-bytes");
    expect(result.log).not.toHaveProperty("scanId");
    const [request] = await readRequests(log);
    expect(request).toMatchObject({
      photoExists: true,
      quad: [
        [0.2, 0.1],
        [0.8, 0.1],
        [0.8, 0.9],
        [0.2, 0.9],
      ],
    });
    expect(await fs.readdir(path.join(root, "incoming"))).toEqual([]);
  });

  it("rejects pending work when the helper exits and starts a new helper next time", async () => {
    const { log, recognizer } = await stubHelper("crash");
    const input = {
      scanId: "scan_2",
      photo: Buffer.from([0xff, 0xd8, 0xff]),
      quad,
    };
    await expect(recognizer.recognize(input)).rejects.toThrow("exited");
    await expect(recognizer.recognize(input)).rejects.toThrow("exited");
    expect(await readRequests(log)).toHaveLength(2);
  });

  it("times out a silent helper", async () => {
    const { recognizer } = await stubHelper("silent");
    await expect(
      recognizer.recognize({
        scanId: "scan_3",
        photo: Buffer.from([0xff, 0xd8, 0xff]),
        quad,
      }),
    ).rejects.toThrow("timed out");
  });
});

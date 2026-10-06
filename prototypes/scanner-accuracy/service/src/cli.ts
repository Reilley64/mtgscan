import fs from "node:fs/promises";
import path from "node:path";
import { cacheDefaultCardsBulkMetadata, prepareCorpus } from "./corpus.js";
import {
  defaultManifestPath,
  fullManifestPath,
  prototypeRoot,
  dataRoot,
} from "./config.js";
import { generateReport } from "./outcomes.js";
import { loadCorpus } from "./corpus.js";
import {
  clearGeometricReferenceCache,
  rerankGeometrically,
} from "./geometric-matcher.js";
import {
  personalManifestPath,
  writePersonalManifest,
} from "./personal-manifest.js";
import {
  loadRectifiedCorpus,
  prepareRectifiedCorpus,
  rectifiedRoot,
} from "./rectified-corpus.js";
import { createRectifiedRerankRunner } from "./rectified-rerank-runner.js";
import {
  recognizeRectified,
  type RectifiedRecognition,
} from "./rectified-recognizer.js";
import { parseCardQuad } from "./rectify.js";
import { DESCRIPTOR_LENGTH } from "./rectified-ranking.js";
const [command, ...args] = process.argv.slice(2);
const valueAfter = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
if (command === "prepare") {
  const manifestPath = args.includes("--personal")
    ? personalManifestPath
    : args.includes("--benchmark")
      ? fullManifestPath
      : defaultManifestPath;
  const result = await prepareCorpus(manifestPath);
  const bulkMetadataFile =
    process.env.PREPARE_BULK === "1"
      ? await cacheDefaultCardsBulkMetadata()
      : null;
  console.log(
    JSON.stringify(
      {
        manifest: result.manifest,
        cards: result.cards.length,
        bulkMetadataFile,
      },
      null,
      2,
    ),
  );
} else if (command === "select-manifest") {
  const input = path.resolve(
    prototypeRoot,
    valueAfter("--input") ?? "../../current_collection.csv",
  );
  const size = Number(valueAfter("--size") ?? "40");
  console.log(
    JSON.stringify(await writePersonalManifest(input, size), null, 2),
  );
} else if (command === "geometric-evaluate") {
  const outcomesPath = path.resolve(
    valueAfter("--outcomes") ?? path.join(dataRoot, "outcomes.ndjson"),
  );
  const capturesRoot = path.resolve(
    valueAfter("--captures") ?? path.join(dataRoot, "captures"),
  );
  const output = path.resolve(
    valueAfter("--output") ?? path.join(dataRoot, "geometric", "latest.json"),
  );
  const corpusPath = valueAfter("--corpus");
  const corpus = corpusPath
    ? JSON.parse(await fs.readFile(path.resolve(corpusPath), "utf8"))
    : await loadCorpus();
  const outcomes = (await fs.readFile(outcomesPath, "utf8"))
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const scans = [];
  try {
    for (const outcome of outcomes) {
      const truth = outcome.groundTruth?.selectedScryfallId;
      const target = corpus.find(
        (card: { scryfallId: string }) => card.scryfallId === truth,
      );
      if (!target)
        throw new Error("outcome ground truth is absent from corpus");
      const candidates = corpus.filter(
        (card: { name: string }) => card.name === target.name,
      );
      const directory = path.join(
        capturesRoot,
        outcome.sessionId.replace(/[^a-zA-Z0-9_-]/g, "_"),
        outcome.scanId.replace(/[^a-zA-Z0-9_-]/g, "_"),
      );
      const stills = await Promise.all(
        ["01-still.jpg", "02-still.jpg", "03-still.jpg"].map((file) =>
          fs.readFile(path.join(directory, file)),
        ),
      );
      const result = await rerankGeometrically(
        stills as [Buffer, Buffer, Buffer],
        candidates,
      );
      scans.push({
        expected: { scryfallId: target.scryfallId, name: target.name },
        acceptedScryfallId: result.acceptedScryfallId,
        top: result.candidates[0]
          ? {
              scryfallId: result.candidates[0].card.scryfallId,
              name: result.candidates[0].card.name,
              support: result.candidates[0].support,
            }
          : null,
        latencyMs: result.warmLatencyMs,
        rssBytes: result.rssBytes,
        abstentionReasons: result.abstentionReasons,
        candidates: result.candidates.map((candidate) => ({
          scryfallId: candidate.card.scryfallId,
          name: candidate.card.name,
          support: candidate.support,
          acceptedFrames: candidate.acceptedFrames,
          frames: candidate.frames,
        })),
      });
    }
  } finally {
    clearGeometricReferenceCache();
  }
  const exactTop1 = scans.filter(
    (scan) => scan.top?.scryfallId === scan.expected.scryfallId,
  ).length;
  const autoAccepts = scans.filter(
    (scan) => scan.acceptedScryfallId !== null,
  ).length;
  const correctAutoAccepts = scans.filter(
    (scan) => scan.acceptedScryfallId === scan.expected.scryfallId,
  ).length;
  const falseAccepts = autoAccepts - correctAutoAccepts;
  const warmLatencies = scans
    .slice(1)
    .map((scan) => scan.latencyMs)
    .sort((a, b) => a - b);
  const report = {
    experiment: "orb-ransac-service-reranker",
    scans,
    summary: {
      total: scans.length,
      exactTop1,
      falseAccepts,
      autoAccepts,
      correctAutoAccepts,
      autoAcceptCoverage: scans.length ? autoAccepts / scans.length : null,
      coldLatencyMs: scans[0]?.latencyMs ?? null,
      warmP95Ms:
        warmLatencies[
          Math.max(0, Math.ceil(warmLatencies.length * 0.95) - 1)
        ] ?? null,
      peakRssBytes: Math.max(0, ...scans.map((scan) => scan.rssBytes)),
    },
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ output, summary: report.summary }, null, 2));
} else if (command === "rectified-prepare") {
  console.log(
    JSON.stringify(
      await prepareRectifiedCorpus({
        collectionCsv: valueAfter("--collection"),
        manifestPath: valueAfter("--manifest"),
      }),
      null,
      2,
    ),
  );
} else if (command === "rectified-evaluate") {
  const quadsPath = valueAfter("--quads") ?? "/tmp/np/eval/quads.json";
  const cropRoot = valueAfter("--crops") ?? "/tmp/np/rectified-eval";
  const repeat = Number(valueAfter("--repeat") ?? "1");
  const woodTableScans = new Set([
    "1788189613457-8b70285e7a48a",
    "1788190211524-46f80737c45e34",
  ]);
  const dscArcaneSignet = "211a1d86-7257-4621-ae05-c2b235c063f0";
  const sldArcaneSignet = "e12857ca-54af-453a-a2ad-b5622e7c9b0c";
  const holdOutExpected = args.includes("--hold-out-expected");
  const corpus = await loadRectifiedCorpus();
  const withoutPrinting = (scryfallId: string) => {
    const kept = [...corpus.cards.keys()].filter(
      (index) => corpus.cards[index]!.scryfallId !== scryfallId,
    );
    const appearance = new Float32Array(kept.length * DESCRIPTOR_LENGTH);
    kept.forEach((index, position) =>
      appearance.set(
        corpus.appearance.subarray(
          index * DESCRIPTOR_LENGTH,
          (index + 1) * DESCRIPTOR_LENGTH,
        ),
        position * DESCRIPTOR_LENGTH,
      ),
    );
    return { cards: kept.map((index) => corpus.cards[index]!), appearance };
  };
  const corpusFor = new Map(
    [dscArcaneSignet, sldArcaneSignet].map((scryfallId) => [
      scryfallId,
      holdOutExpected ? withoutPrinting(scryfallId) : corpus,
    ]),
  );
  const expectedOracle = new Map(
    corpus.cards.map((card) => [card.scryfallId, card.oracleId]),
  );
  const entries = (
    JSON.parse(await fs.readFile(quadsPath, "utf8")) as Array<{
      index: number;
      path: string;
      corners: Array<{ x: number; y: number }>;
    }>
  ).filter((entry) => entry.corners.length === 4);
  const runner = createRectifiedRerankRunner({
    featureRoot: rectifiedRoot,
    maxReranksPerWorker: 50,
    timeoutMs: 10_000,
    workers: Number(valueAfter("--workers") ?? "2"),
  });
  await runner.warm();
  await fs.mkdir(cropRoot, { recursive: true });
  const results: Array<{
    index: number;
    surface: "wood" | "binder";
    expected: string;
    recognition: RectifiedRecognition;
  }> = [];
  try {
    for (let pass = 0; pass < repeat; pass++)
      for (const entry of entries) {
        const scan = path.basename(path.dirname(entry.path));
        const surface = woodTableScans.has(scan) ? "wood" : "binder";
        const expected = surface === "wood" ? dscArcaneSignet : sldArcaneSignet;
        const [topLeft, topRight, bottomRight, bottomLeft] = entry.corners;
        const { recognition, crop } = await recognizeRectified(
          {
            scanId: `eval-${entry.index}`,
            photo: await fs.readFile(entry.path),
            quad: parseCardQuad(
              JSON.stringify({ topLeft, topRight, bottomRight, bottomLeft }),
            ),
          },
          corpusFor.get(expected)!,
          runner,
        );
        if (pass === 0 && !holdOutExpected)
          await fs.writeFile(
            path.join(cropRoot, `${String(entry.index).padStart(3, "0")}.jpg`),
            crop,
          );
        results.push({ index: entry.index, surface, expected, recognition });
        if (pass === 0)
          console.log(
            [
              String(entry.index).padStart(2),
              surface.padEnd(6),
              recognition.candidates
                .slice(0, 3)
                .map(
                  (candidate) =>
                    `${candidate.name} ${candidate.set}#${candidate.collectorNumber}${candidate.scryfallId === expected ? "*" : ""} (${candidate.score})`,
                )
                .join(" | "),
              recognition.decision.accepted
                ? `ACCEPT ${recognition.decision.scryfallId === expected ? "correct" : "WRONG"}`
                : `abstain: ${recognition.decision.reasons.join("; ")}`,
              JSON.stringify(recognition.stageMs),
              `${recognition.serviceLatencyMs} ms`,
            ].join("  "),
          );
      }
  } finally {
    await runner.close();
  }
  const percentile = (values: number[], fraction: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
  };
  const summarize = (group: typeof results) => ({
    photos: group.length,
    identityTop1: group.filter(
      (result) =>
        result.recognition.candidates[0]?.oracleId ===
        expectedOracle.get(result.expected),
    ).length,
    exactPrintingTop1: group.filter(
      (result) =>
        result.recognition.candidates[0]?.scryfallId === result.expected,
    ).length,
    correctAccepts: group.filter(
      (result) => result.recognition.decision.scryfallId === result.expected,
    ).length,
    falseAccepts: group.filter(
      (result) =>
        result.recognition.decision.accepted &&
        result.recognition.decision.scryfallId !== result.expected,
    ).length,
    abstentions: group.filter((result) => !result.recognition.decision.accepted)
      .length,
    latencyP50Ms: percentile(
      group.map((result) => result.recognition.serviceLatencyMs),
      0.5,
    ),
    latencyP95Ms: percentile(
      group.map((result) => result.recognition.serviceLatencyMs),
      0.95,
    ),
    latencyMaxMs: percentile(
      group.map((result) => result.recognition.serviceLatencyMs),
      1,
    ),
  });
  const summary = {
    corpusCards: corpus.cards.length,
    holdOutExpected,
    repeat,
    wood: summarize(results.filter((result) => result.surface === "wood")),
    binder: summarize(results.filter((result) => result.surface === "binder")),
    all: summarize(results),
  };
  await fs.mkdir(rectifiedRoot, { recursive: true });
  await fs.writeFile(
    path.join(
      rectifiedRoot,
      holdOutExpected
        ? "evaluation-held-out-latest.json"
        : "evaluation-latest.json",
    ),
    JSON.stringify({ summary, results }, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} else if (command === "report")
  console.log(JSON.stringify(await generateReport(), null, 2));
else {
  console.error(
    "Commands: corpus:prepare [--benchmark|--personal], select:manifest [--input path] [--size 30..50], report, geometric-evaluate [--outcomes path --captures path --corpus path --output path], rectified-prepare [--collection path --manifest path], rectified-evaluate [--quads path --crops directory --repeat n --workers n --hold-out-expected]",
  );
  process.exitCode = 1;
}

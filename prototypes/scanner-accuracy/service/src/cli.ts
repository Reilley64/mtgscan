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
} else if (command === "report")
  console.log(JSON.stringify(await generateReport(), null, 2));
else {
  console.error(
    "Commands: corpus:prepare [--benchmark|--personal], select:manifest [--input path] [--size 30..50], report, geometric-evaluate [--outcomes path --captures path --corpus path --output path]",
  );
  process.exitCode = 1;
}

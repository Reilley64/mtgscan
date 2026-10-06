import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
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
  type RectifiedCorpus,
} from "./rectified-corpus.js";
import { createRectifiedRerankRunner } from "./rectified-rerank-runner.js";
import {
  recognizeRectified,
  type RectifiedRecognition,
} from "./rectified-recognizer.js";
import { parseCardQuad } from "./rectify.js";
import {
  DESCRIPTOR_LENGTH,
  EDGE_DESCRIPTOR_LENGTH,
} from "./rectified-ranking.js";
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
  const set = valueAfter("--set") ?? "offline";
  const rotation = Number(valueAfter("--rotate") ?? "0");
  const repeat = Number(valueAfter("--repeat") ?? "1");
  const holdOutExpected = args.includes("--hold-out-expected");
  if (
    !["offline", "phone"].includes(set) ||
    ![0, 90, 180, 270].includes(rotation)
  )
    throw new Error(
      "--set must be offline or phone; --rotate must be 0, 90, 180, or 270",
    );
  const cropRoot =
    valueAfter("--crops") ??
    `/tmp/np/rectified-eval${set === "phone" ? "-phone" : ""}${rotation ? `-${rotation}` : ""}`;
  const edgeQuad = [
    { x: 0.0005, y: 0.0005 },
    { x: 0.9995, y: 0.0005 },
    { x: 0.9995, y: 0.9995 },
    { x: 0.0005, y: 0.9995 },
  ];
  const woodTableScans = new Set([
    "1788189613457-8b70285e7a48a",
    "1788190211524-46f80737c45e34",
  ]);
  const dscArcaneSignet = "211a1d86-7257-4621-ae05-c2b235c063f0";
  const sldArcaneSignet = "e12857ca-54af-453a-a2ad-b5622e7c9b0c";
  const entries =
    set === "phone"
      ? (
          JSON.parse(
            await fs.readFile(
              valueAfter("--truth") ?? "/tmp/np/phone-crops/truth.json",
              "utf8",
            ),
          ) as Array<{ sequence: number; crop: string; scryfallId: string }>
        ).map((entry) => ({
          label: String(entry.sequence),
          group: "phone",
          path: entry.crop,
          corners: edgeQuad,
          expected: entry.scryfallId,
        }))
      : (
          JSON.parse(
            await fs.readFile(
              valueAfter("--quads") ?? "/tmp/np/eval/quads.json",
              "utf8",
            ),
          ) as Array<{
            index: number;
            path: string;
            corners: Array<{ x: number; y: number }>;
          }>
        )
          .filter((entry) => entry.corners.length === 4)
          .map((entry) => {
            const wood = woodTableScans.has(
              path.basename(path.dirname(entry.path)),
            );
            return {
              label: String(entry.index),
              group: wood ? "wood" : "binder",
              path: entry.path,
              corners: entry.corners,
              expected: wood ? dscArcaneSignet : sldArcaneSignet,
            };
          });
  const corpus = await loadRectifiedCorpus();
  const heldOut = new Map<string, RectifiedCorpus>();
  const corpusFor = (scryfallId: string) => {
    if (!holdOutExpected) return corpus;
    const kept = [...corpus.cards.keys()].filter(
      (index) => corpus.cards[index]!.scryfallId !== scryfallId,
    );
    const slice = (values: Float32Array, length: number) => {
      const result = new Float32Array(kept.length * length);
      kept.forEach((index, position) =>
        result.set(
          values.subarray(index * length, (index + 1) * length),
          position * length,
        ),
      );
      return result;
    };
    const result = heldOut.get(scryfallId) ?? {
      cards: kept.map((index) => corpus.cards[index]!),
      catalog: corpus.cards,
      appearance: {
        color: slice(corpus.appearance.color, DESCRIPTOR_LENGTH),
        edge: slice(corpus.appearance.edge, EDGE_DESCRIPTOR_LENGTH),
      },
    };
    heldOut.set(scryfallId, result);
    return result;
  };
  const expectedOracle = new Map(
    corpus.cards.map((card) => [card.scryfallId, card.oracleId]),
  );
  const runner = createRectifiedRerankRunner({
    featureRoot: rectifiedRoot,
    maxReranksPerWorker: 50,
    timeoutMs: 10_000,
    workers: Number(valueAfter("--workers") ?? "3"),
  });
  await runner.warm();
  await fs.mkdir(cropRoot, { recursive: true });
  const results: Array<{
    label: string;
    group: string;
    expected: string;
    shortlisted: boolean;
    stageOneRank: { color: number; edge: number; fused: number } | null;
    recognition: RectifiedRecognition;
    trace?: unknown;
  }> = [];
  try {
    for (let pass = 0; pass < repeat; pass++)
      for (const entry of entries) {
        const original = await fs.readFile(entry.path);
        const photo = rotation
          ? await sharp(
              await sharp(original).rotate().jpeg({ quality: 95 }).toBuffer(),
            )
              .rotate(rotation)
              .jpeg({ quality: 95 })
              .toBuffer()
          : original;
        const turned = entry.corners.map(({ x, y }) =>
          rotation === 90
            ? { x: 1 - y, y: x }
            : rotation === 180
              ? { x: 1 - x, y: 1 - y }
              : rotation === 270
                ? { x: y, y: 1 - x }
                : { x, y },
        );
        const first = turned.reduce(
          (best, point, index) =>
            Math.hypot(point.x, point.y) <
            Math.hypot(turned[best]!.x, turned[best]!.y)
              ? index
              : best,
          0,
        );
        const [topLeft, topRight, bottomRight, bottomLeft] = [0, 1, 2, 3].map(
          (offset) => turned[(first + offset) % 4]!,
        );
        const entryCorpus = corpusFor(entry.expected);
        const { recognition, crop, trace } = await recognizeRectified(
          {
            scanId: `eval-${entry.label}`,
            photo,
            quad: parseCardQuad(
              JSON.stringify({ topLeft, topRight, bottomRight, bottomLeft }),
            ),
          },
          entryCorpus,
          runner,
        );
        if (pass === 0 && !holdOutExpected)
          await fs.writeFile(
            path.join(cropRoot, `${entry.label.padStart(3, "0")}.jpg`),
            crop,
          );
        const position = entryCorpus.cards.findIndex(
          (card) => card.scryfallId === entry.expected,
        );
        const rankIn = (values: Float32Array) =>
          values.filter((value) => value > values[position]!).length + 1;
        results.push({
          label: entry.label,
          group: entry.group,
          expected: entry.expected,
          shortlisted: trace.shortlist.includes(entry.expected),
          stageOneRank:
            position >= 0
              ? {
                  color: rankIn(trace.scores.color),
                  edge: rankIn(trace.scores.edge),
                  fused: rankIn(trace.fused),
                }
              : null,
          recognition,
          ...(pass === 0
            ? {
                trace: {
                  strengths: trace.strengths,
                  reranked: trace.reranked,
                  ranked: trace.ranked.map((candidate) => ({
                    ...candidate,
                    oracleId: entryCorpus.cards[candidate.index]!.oracleId,
                    name: entryCorpus.cards[candidate.index]!.name,
                  })),
                },
              }
            : {}),
        });
        if (pass === 0)
          console.log(
            [
              entry.label.padStart(3),
              entry.group.padEnd(6),
              `r${recognition.rotation}`,
              results.at(-1)!.stageOneRank
                ? `rank c${results.at(-1)!.stageOneRank!.color} e${results.at(-1)!.stageOneRank!.edge} f${results.at(-1)!.stageOneRank!.fused}${results.at(-1)!.shortlisted ? " in" : " OUT"}`
                : "held out",
              recognition.candidates
                .slice(0, 3)
                .map(
                  (candidate) =>
                    `${candidate.name} ${candidate.set}#${candidate.collectorNumber}${candidate.scryfallId === entry.expected ? "*" : ""} (${candidate.score})`,
                )
                .join(" | "),
              recognition.decision.accepted
                ? `ACCEPT ${recognition.decision.scryfallId === entry.expected ? "correct" : "WRONG"}`
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
    recognitions: group.length,
    shortlistRecall: holdOutExpected
      ? null
      : group.filter((result) => result.shortlisted).length,
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
    set,
    rotation,
    corpusCards: corpus.cards.length,
    holdOutExpected,
    repeat,
    ...Object.fromEntries(
      [...new Set(results.map((result) => result.group))].map((group) => [
        group,
        summarize(results.filter((result) => result.group === group)),
      ]),
    ),
    all: summarize(results),
  };
  await fs.mkdir(rectifiedRoot, { recursive: true });
  await fs.writeFile(
    path.join(
      rectifiedRoot,
      `evaluation-${set}${rotation ? `-${rotation}` : ""}${holdOutExpected ? "-held-out" : ""}-latest.json`,
    ),
    JSON.stringify({ summary, results }, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} else if (command === "report")
  console.log(JSON.stringify(await generateReport(), null, 2));
else {
  console.error(
    "Commands: corpus:prepare [--benchmark|--personal], select:manifest [--input path] [--size 30..50], report, geometric-evaluate [--outcomes path --captures path --corpus path --output path], rectified-prepare [--collection path --manifest path], rectified-evaluate [--set offline|phone --quads path --truth path --rotate 0|90|180|270 --crops directory --repeat n --workers n --hold-out-expected]",
  );
  process.exitCode = 1;
}

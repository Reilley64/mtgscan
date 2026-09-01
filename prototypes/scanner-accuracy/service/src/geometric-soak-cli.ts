import fs from "node:fs/promises";
import path from "node:path";
import { dataRoot } from "./config.js";
import { loadCorpus } from "./corpus.js";
import {
  createIsolatedGeometricRunner,
  IsolatedGeometricRunnerError,
} from "./isolated-geometric-runner.js";
import type { CorpusCard } from "./ranking.js";

const DEFAULT_REPETITIONS = 20;
const DEFAULT_MAX_RERANKS_PER_WORKER = 5;
const DEFAULT_TIMEOUT_MS = 10_000;
const LATENCY_LIMIT_MS = 1_000;
const PROCESS_RSS_LIMIT_BYTES = 450 * 1024 * 1024;
const RSS_GROWTH_ALLOWANCE_BYTES = 16 * 1024 * 1024;

const args = process.argv.slice(2);
const valueAfter = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const positiveInteger = (flag: string, fallback: number) => {
  const raw = valueAfter(flag);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${flag} must be a finite positive integer`);
  return value;
};
const percentile = (values: number[], fraction: number) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!;
};
const distribution = (values: number[]) => ({
  count: values.length,
  min: values.length ? Math.min(...values) : null,
  p50: percentile(values, 0.5),
  p95: percentile(values, 0.95),
  max: values.length ? Math.max(...values) : null,
});
const median = (values: number[]) => percentile(values, 0.5) ?? 0;
const safeSegment = (value: unknown) =>
  typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value) ? value : null;

const repetitions = positiveInteger("--repetitions", DEFAULT_REPETITIONS);
const maxReranksPerWorker = positiveInteger(
  "--max-reranks-per-worker",
  DEFAULT_MAX_RERANKS_PER_WORKER,
);
const timeoutMs = positiveInteger("--timeout-ms", DEFAULT_TIMEOUT_MS);
const outcomesPath = path.resolve(
  valueAfter("--outcomes") ?? path.join(dataRoot, "outcomes.ndjson"),
);
const capturesRoot = path.resolve(
  valueAfter("--captures") ?? path.join(dataRoot, "captures"),
);
const outputPath = path.resolve(
  valueAfter("--output") ??
    path.join(dataRoot, "geometric", "isolated-soak-latest.json"),
);
const referenceRoot = path.resolve(
  valueAfter("--reference-root") ?? path.join(dataRoot, "scryfall", "images"),
);
const corpusPath = valueAfter("--corpus");
const corpus: CorpusCard[] = corpusPath
  ? JSON.parse(await fs.readFile(path.resolve(corpusPath), "utf8"))
  : await loadCorpus();
const outcomes = (await fs.readFile(outcomesPath, "utf8"))
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line) as Record<string, unknown>);
if (outcomes.length !== 5)
  throw new Error("The isolated soak requires exactly five recorded scans");

const jobs = outcomes.map((outcome) => {
  const groundTruth = outcome.groundTruth;
  const truthId =
    typeof groundTruth === "object" && groundTruth !== null
      ? (groundTruth as Record<string, unknown>).selectedScryfallId
      : null;
  const sessionId = safeSegment(outcome.sessionId);
  const scanId = safeSegment(outcome.scanId);
  if (typeof truthId !== "string" || !sessionId || !scanId)
    throw new Error("A recorded scan has invalid identifiers");
  const target = corpus.find((card) => card.scryfallId === truthId);
  if (!target) throw new Error("Recorded ground truth is absent from corpus");
  const candidates = corpus.filter((card) => card.name === target.name);
  if (candidates.length === 0)
    throw new Error("Recorded scan has no same-name candidates");
  const directory = path.join(capturesRoot, sessionId, scanId);
  return {
    expectedScryfallId: target.scryfallId,
    candidates,
    stillPaths: [
      path.join(directory, "01-still.jpg"),
      path.join(directory, "02-still.jpg"),
      path.join(directory, "03-still.jpg"),
    ] as [string, string, string],
  };
});

const runner = createIsolatedGeometricRunner({
  maxReranksPerWorker,
  timeoutMs,
});
const endToEndLatencyMs: number[] = [];
const matcherLatencyMs: number[] = [];
const warmMatcherLatencyMs: number[] = [];
const parentRssBytes = [process.memoryUsage().rss];
const workerRssBytes: number[] = [];
const combinedRssBytes: number[] = [];
const generations = new Set<number>();
const workerRssByGeneration = new Map<number, number[]>();
let exactTop1 = 0;
let autoAccepts = 0;
let correctAutoAccepts = 0;
let falseAccepts = 0;
let completed = 0;
let recycleCount = 0;
let timeouts = 0;
let exits = 0;
let jobFailures = 0;

try {
  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    for (const job of jobs) {
      const started = performance.now();
      try {
        const result = await runner.rerank({
          stillPaths: job.stillPaths,
          candidates: job.candidates,
          referenceRoot,
        });
        const elapsed = Math.round(performance.now() - started);
        endToEndLatencyMs.push(elapsed);
        matcherLatencyMs.push(result.warmLatencyMs);
        if (result.worker.completedByWorker > 1)
          warmMatcherLatencyMs.push(result.warmLatencyMs);
        const parentRss = process.memoryUsage().rss;
        parentRssBytes.push(parentRss);
        workerRssBytes.push(result.worker.rssBytes);
        combinedRssBytes.push(parentRss + result.worker.rssBytes);
        generations.add(result.worker.generation);
        const generationRss =
          workerRssByGeneration.get(result.worker.generation) ?? [];
        generationRss.push(result.worker.rssBytes);
        workerRssByGeneration.set(result.worker.generation, generationRss);
        recycleCount = result.worker.recycleCount;
        completed += 1;
        if (result.candidates[0]?.card.scryfallId === job.expectedScryfallId)
          exactTop1 += 1;
        if (result.acceptedScryfallId !== null) autoAccepts += 1;
        if (result.acceptedScryfallId === job.expectedScryfallId)
          correctAutoAccepts += 1;
        else if (result.acceptedScryfallId !== null) falseAccepts += 1;
      } catch (error) {
        parentRssBytes.push(process.memoryUsage().rss);
        if (error instanceof IsolatedGeometricRunnerError) {
          if (error.code === "GEOMETRIC_WORKER_TIMEOUT") timeouts += 1;
          else if (error.code === "GEOMETRIC_WORKER_EXIT") exits += 1;
          else jobFailures += 1;
        } else jobFailures += 1;
      }
    }
  }
} finally {
  await runner.close();
}

const attempts = repetitions * jobs.length;
const windowSize = Math.min(
  20,
  Math.max(5, Math.floor(parentRssBytes.length / 5)),
);
const firstParentMedian = median(parentRssBytes.slice(0, windowSize));
const lastParentMedian = median(parentRssBytes.slice(-windowSize));
const parentObservedMaxBytes = Math.max(0, ...parentRssBytes);
const combinedPeakBytes = Math.max(0, ...combinedRssBytes);
const parentPeakBytes = Math.max(0, ...parentRssBytes);
const workerPeakBytes = Math.max(0, ...workerRssBytes);
const workerGenerationPeakRssBytes = [...workerRssByGeneration.entries()]
  .sort(([left], [right]) => left - right)
  .map(([, samples]) => Math.max(...samples));
const generationWindowSize = Math.min(5, workerGenerationPeakRssBytes.length);
const firstGenerationPeakMedian = median(
  workerGenerationPeakRssBytes.slice(0, generationWindowSize),
);
const lastGenerationPeakMedian = median(
  workerGenerationPeakRssBytes.slice(-generationWindowSize),
);
const workerGenerationObservedMaxBytes = Math.max(
  0,
  ...workerGenerationPeakRssBytes,
);
const endToEnd = distribution(endToEndLatencyMs);
const matcherWarm = distribution(warmMatcherLatencyMs);
const expectedWarmSamples = completed - generations.size;
const warmSampleCountMatches =
  warmMatcherLatencyMs.length === expectedWarmSamples;
const gates = {
  accuracy: {
    pass:
      completed === attempts && exactTop1 === attempts && falseAccepts === 0,
    requirement:
      "all attempts complete with exact top-1 and zero false accepts",
  },
  latency: {
    pass:
      endToEnd.p95 !== null &&
      endToEnd.p95 <= LATENCY_LIMIT_MS &&
      warmSampleCountMatches &&
      (expectedWarmSamples === 0 ||
        (matcherWarm.p95 !== null && matcherWarm.p95 <= LATENCY_LIMIT_MS)),
    limitMs: LATENCY_LIMIT_MS,
    observedEndToEndP95Ms: endToEnd.p95,
    observedMatcherWarmP95Ms: matcherWarm.p95,
    expectedWarmSamples,
    observedWarmSamples: warmMatcherLatencyMs.length,
  },
  processRss: {
    pass:
      parentPeakBytes < PROCESS_RSS_LIMIT_BYTES &&
      workerPeakBytes < PROCESS_RSS_LIMIT_BYTES,
    perProcessLimitBytes: PROCESS_RSS_LIMIT_BYTES,
    observedParentPeakBytes: parentPeakBytes,
    observedWorkerPeakBytes: workerPeakBytes,
  },
  noUpwardParentGrowth: {
    pass:
      parentObservedMaxBytes <= firstParentMedian + RSS_GROWTH_ALLOWANCE_BYTES,
    allowanceBytes: RSS_GROWTH_ALLOWANCE_BYTES,
    baselineFirstWindowMedianBytes: firstParentMedian,
    observedMaxBytes: parentObservedMaxBytes,
    maxDeltaBytes: parentObservedMaxBytes - firstParentMedian,
    sampleCount: parentRssBytes.length,
    firstWindowSamples: windowSize,
    finalWindowMedianBytes: lastParentMedian,
    finalWindowDeltaBytes: lastParentMedian - firstParentMedian,
  },
  boundedWorkerGenerationGrowth: {
    pass:
      workerGenerationObservedMaxBytes <=
      firstGenerationPeakMedian + RSS_GROWTH_ALLOWANCE_BYTES,
    allowanceBytes: RSS_GROWTH_ALLOWANCE_BYTES,
    baselineFirstGenerationWindowPeakMedianBytes: firstGenerationPeakMedian,
    observedMaxGenerationPeakBytes: workerGenerationObservedMaxBytes,
    maxDeltaBytes: workerGenerationObservedMaxBytes - firstGenerationPeakMedian,
    generationCount: workerGenerationPeakRssBytes.length,
    baselineGenerationCount: generationWindowSize,
    finalGenerationWindowPeakMedianBytes: lastGenerationPeakMedian,
    finalWindowDeltaBytes: lastGenerationPeakMedian - firstGenerationPeakMedian,
  },
};
const report = {
  experiment: "isolated-orb-ransac-worker-soak",
  configuration: {
    recordedScans: jobs.length,
    repetitions,
    attempts,
    maxReranksPerWorker,
    timeoutMs,
  },
  accuracy: {
    completed,
    exactTop1,
    autoAccepts,
    correctAutoAccepts,
    falseAccepts,
  },
  latencyMs: {
    endToEnd,
    matcherAll: distribution(matcherLatencyMs),
    matcherWarm,
    endToEndSeries: endToEndLatencyMs,
    matcherSeries: matcherLatencyMs,
  },
  memory: {
    parentRssBytes,
    workerRssBytes,
    combinedRssBytes,
    parentPeakBytes,
    workerPeakBytes,
    combinedPeakBytes,
    workerGenerationPeakRssBytes,
    combinedDiagnostic: {
      agreedAcceptanceGate: null,
      hypotheticalCombined450MiBPass:
        combinedPeakBytes < PROCESS_RSS_LIMIT_BYTES,
    },
  },
  lifecycle: {
    generations: generations.size,
    recycleCount,
    timeouts,
    exits,
    jobFailures,
  },
  gates: {
    ...gates,
    pass: Object.values(gates).every((gate) => gate.pass),
  },
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    {
      report: path.basename(outputPath),
      configuration: report.configuration,
      accuracy: report.accuracy,
      latencyMs: {
        endToEnd: report.latencyMs.endToEnd,
        matcherWarm: report.latencyMs.matcherWarm,
      },
      memory: {
        parentPeakBytes: report.memory.parentPeakBytes,
        workerPeakBytes: report.memory.workerPeakBytes,
        combinedPeakBytes: report.memory.combinedPeakBytes,
      },
      lifecycle: report.lifecycle,
      gates: report.gates,
    },
    null,
    2,
  ),
);
if (!report.gates.pass) process.exitCode = 1;

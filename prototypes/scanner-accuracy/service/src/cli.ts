import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  cacheDefaultCardsBulkMetadata,
  cached,
  prepareCorpus,
} from "./corpus.js";
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
import { parseCardQuad, solvePerspective } from "./rectify.js";
import { TILE } from "./rectified-printing.js";
import {
  DESCRIPTOR_LENGTH,
  EDGE_DESCRIPTOR_LENGTH,
} from "./rectified-ranking.js";
function holdOut(
  corpus: RectifiedCorpus,
  scryfallId: string,
  keepInCatalog: boolean,
): RectifiedCorpus {
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
  const printing = corpus.printing;
  const illustration = [...(printing?.groups ?? [])].find(([, members]) =>
    members.includes(scryfallId),
  )?.[0];
  return {
    cards: kept.map((index) => corpus.cards[index]!),
    catalog: keepInCatalog
      ? corpus.catalog
      : corpus.catalog.filter((card) => card.scryfallId !== scryfallId),
    appearance: {
      color: slice(corpus.appearance.color, DESCRIPTOR_LENGTH),
      edge: slice(corpus.appearance.edge, EDGE_DESCRIPTOR_LENGTH),
    },
    printing:
      printing && illustration
        ? {
            ...printing,
            groups: new Map(
              [...printing.groups]
                .map(([id, members]): [string, string[]] => [
                  id,
                  members.filter((member) => member !== scryfallId),
                ])
                .filter(([, members]) => members.length > 1),
            ),
            async load(id) {
              const group = await printing.load(id);
              if (!group || id !== illustration) return group;
              if (printing.groups.get(id)!.length <= 2) return null;
              return {
                ...group,
                coarse: new Map(
                  [...group.coarse].filter(([member]) => member !== scryfallId),
                ),
                clusters: group.clusters.flatMap((cluster) => {
                  const removed = cluster.members.indexOf(scryfallId);
                  if (removed < 0) return [cluster];
                  if (cluster.members.length === 1) return [];
                  const count = cluster.members.length;
                  const size = cluster.tiles.length * TILE * TILE * 3;
                  const tileData = new Int8Array(
                    cluster.tileData.length - size,
                  );
                  tileData.set(cluster.tileData.subarray(0, removed * size));
                  tileData.set(
                    cluster.tileData.subarray((removed + 1) * size),
                    removed * size,
                  );
                  const pairs: number[][] = [];
                  let pair = 0;
                  for (let a = 0; a < count; a++)
                    for (let b = a + 1; b < count; b++, pair++)
                      if (a !== removed && b !== removed)
                        pairs.push(cluster.separating[pair]!);
                  return [
                    {
                      ...cluster,
                      members: cluster.members.filter(
                        (_, index) => index !== removed,
                      ),
                      maps: cluster.maps.filter(
                        (_, index) => index !== removed,
                      ),
                      separating: pairs,
                      tileData,
                    },
                  ];
                }),
              };
            },
          }
        : printing,
  };
}

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
    const result = heldOut.get(scryfallId) ?? holdOut(corpus, scryfallId, true);
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
} else if (command === "rectified-printing-evaluate") {
  const seed = Number(valueAfter("--seed") ?? "1");
  const strict = args.includes("--hold-out-expected");
  const dropFromCatalog = args.includes("--drop-from-catalog");
  const nameFilter = valueAfter("--name");
  const variants = args.includes("--check-only") ? [true] : [true, false];
  const deckPath = valueAfter("--deck");
  const corpus = await loadRectifiedCorpus();
  const printing = corpus.printing;
  if (!printing) throw new Error("run rectified:prepare first");
  const byId = new Map(corpus.catalog.map((card) => [card.scryfallId, card]));
  const deck = deckPath
    ? new Set(
        (await fs.readFile(deckPath, "utf8"))
          .split("\n")
          .map((line) => line.split("\t")[0]!.trim())
          .filter(Boolean),
      )
    : null;
  const names = new Set(
    (await fs.readFile(path.join(rectifiedRoot, "extra-names.txt"), "utf8"))
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
  );
  const groups = [...printing.groups].filter(
    ([, members]) =>
      members.some((id) =>
        deck ? deck.has(id) : names.has(byId.get(id)!.name),
      ) &&
      (!nameFilter || byId.get(members[0]!)!.name.includes(nameFilter)),
  );
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (low: number, high: number) => low + random() * (high - low);
  const runner = createRectifiedRerankRunner({
    featureRoot: rectifiedRoot,
    maxReranksPerWorker: 50,
    timeoutMs: 10_000,
    workers: 3,
  });
  await runner.warm();
  const results: Array<{
    group: string;
    name: string;
    expected: string;
    printing: string;
    quad: string;
    check: boolean;
    outcome: "correct" | "abstained" | "wrong";
    top: string | null;
    checkChosen: string | null | undefined;
    reasons: string[];
    serviceLatencyMs: number;
    printingMs: number | null;
    printingCheck: RectifiedRecognition["printingCheck"];
  }> = [];
  const photoWidth = 2376,
    photoHeight = 4224;
  try {
    for (const [illustrationId, members] of groups)
      for (const expected of members) {
        const card = byId.get(expected)!;
        const large = await cached(
          `https://cards.scryfall.io/large/front/${expected[0]}/${expected[1]}/${expected}.jpg`,
          path.join(dataRoot, "scryfall", "large", `${expected}.jpg`),
          { headers: { Accept: "image/jpeg,image/*" } },
          20_000_000,
        );
        const { data: source, info } = await sharp(large)
          .removeAlpha()
          .toColourspace("srgb")
          .raw()
          .toBuffer({ resolveWithObject: true });
        const cardHeight = between(1500, 2300),
          cardWidth = (cardHeight * 63) / 88;
        const angle = (between(-8, 8) * Math.PI) / 180;
        const centerX = photoWidth / 2 + between(-150, 150),
          centerY = photoHeight / 2 + between(-300, 300);
        const keystone = between(-0.08, 0.08),
          slant = between(-0.05, 0.05);
        const corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([sideX, sideY]): [number, number] => {
          const x =
            ((sideX! * cardWidth) / 2) *
            (1 + (sideY! < 0 ? keystone : -keystone));
          const y =
            ((sideY! * cardHeight) / 2) * (1 + (sideX! < 0 ? slant : -slant));
          return [
            centerX + x * Math.cos(angle) - y * Math.sin(angle),
            centerY + x * Math.sin(angle) + y * Math.cos(angle),
          ];
        });
        const cardCorners: Array<[number, number]> = [
          [0, 0],
          [info.width, 0],
          [info.width, info.height],
          [0, info.height],
        ];
        const toCard = solvePerspective(corners, cardCorners);
        const fromCard = solvePerspective(cardCorners, corners);
        const radius = info.width * 0.045;
        const background = [
          between(40, 200),
          between(40, 200),
          between(40, 200),
        ];
        const raw = Buffer.alloc(photoWidth * photoHeight * 3);
        for (let y = 0; y < photoHeight; y++)
          for (let x = 0; x < photoWidth; x++) {
            const target = (y * photoWidth + x) * 3;
            const block =
              ((Math.floor(y / 16) * 7919 + Math.floor(x / 16) * 104729) % 97) -
              48;
            for (let k = 0; k < 3; k++)
              raw[target + k] = background[k]! + block / 6;
          }
        const left = Math.max(
            0,
            Math.floor(Math.min(...corners.map(([x]) => x))),
          ),
          right = Math.min(
            photoWidth,
            Math.ceil(Math.max(...corners.map(([x]) => x))),
          ),
          top = Math.max(0, Math.floor(Math.min(...corners.map(([, y]) => y)))),
          bottom = Math.min(
            photoHeight,
            Math.ceil(Math.max(...corners.map(([, y]) => y))),
          );
        for (let y = top; y < bottom; y++)
          for (let x = left; x < right; x++) {
            const u = x + 0.5,
              v = y + 0.5;
            const w = toCard[6]! * u + toCard[7]! * v + toCard[8]!;
            const cx = (toCard[0]! * u + toCard[1]! * v + toCard[2]!) / w,
              cy = (toCard[3]! * u + toCard[4]! * v + toCard[5]!) / w;
            if (cx < 0 || cy < 0 || cx >= info.width || cy >= info.height)
              continue;
            const nearX = Math.min(cx, info.width - cx),
              nearY = Math.min(cy, info.height - cy);
            if (
              nearX < radius &&
              nearY < radius &&
              Math.hypot(radius - nearX, radius - nearY) > radius
            )
              continue;
            const sx = Math.min(info.width - 1, Math.max(0, cx - 0.5)),
              sy = Math.min(info.height - 1, Math.max(0, cy - 0.5));
            const x0 = Math.floor(sx),
              y0 = Math.floor(sy),
              x1 = Math.min(info.width - 1, x0 + 1),
              y1 = Math.min(info.height - 1, y0 + 1);
            const fx = sx - x0,
              fy = sy - y0;
            for (let k = 0; k < 3; k++) {
              const at = (px: number, py: number) =>
                source[(py * info.width + px) * 3 + k]!;
              const upper = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
              const lower = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
              raw[(y * photoWidth + x) * 3 + k] = Math.round(
                upper + (lower - upper) * fy,
              );
            }
          }
        const blurred = await sharp(raw, {
          raw: { width: photoWidth, height: photoHeight, channels: 3 },
        })
          .blur(between(0.8, 2))
          .raw()
          .toBuffer();
        const gradientX = between(-0.25, 0.25),
          gradientY = between(-0.25, 0.25);
        const balance = [
          between(0.9, 1.1),
          between(0.9, 1.1),
          between(0.9, 1.1),
        ];
        const glareX = between(left, right),
          glareY = between(top, bottom),
          glareRadius = between(100, 300),
          glareStrength = between(80, 200),
          noise = between(2, 6);
        for (let y = 0; y < photoHeight; y++)
          for (let x = 0; x < photoWidth; x++) {
            const gain =
              1 +
              gradientX * (x / photoWidth - 0.5) * 2 +
              gradientY * (y / photoHeight - 0.5) * 2;
            const glare =
              glareStrength *
              Math.exp(
                -((x - glareX) ** 2 + (y - glareY) ** 2) /
                  (2 * glareRadius ** 2),
              );
            for (let k = 0; k < 3; k++) {
              const index = (y * photoWidth + x) * 3 + k;
              blurred[index] = Math.max(
                0,
                Math.min(
                  255,
                  Math.round(
                    blurred[index]! * gain * balance[k]! +
                      glare +
                      (random() + random() + random() - 1.5) * 2 * noise,
                  ),
                ),
              );
            }
          }
        const photo = await sharp(blurred, {
          raw: { width: photoWidth, height: photoHeight, channels: 3 },
        })
          .rotate(270)
          .jpeg({ quality: Math.round(between(80, 92)) })
          .withMetadata({ orientation: 6 })
          .toBuffer();
        const project = ([x, y]: [number, number]): [number, number] => {
          const w = fromCard[6]! * x + fromCard[7]! * y + fromCard[8]!;
          return [
            (fromCard[0]! * x + fromCard[1]! * y + fromCard[2]!) / w,
            (fromCard[3]! * x + fromCard[4]! * y + fromCard[5]!) / w,
          ];
        };
        const insetX = info.width * 0.035,
          insetY = info.height * 0.025;
        const quads: Array<[string, Array<[number, number]>]> = [
          ["true", corners],
          [
            "jitter",
            corners.map(([x, y]) => [x + between(-5, 5), y + between(-5, 5)]),
          ],
          [
            "inner-frame",
            (
              [
                [insetX, insetY],
                [info.width - insetX, insetY],
                [info.width - insetX, info.height - insetY],
                [insetX, info.height - insetY],
              ] as Array<[number, number]>
            ).map(project),
          ],
        ];
        for (const [quadName, quadCorners] of quads)
          for (const check of variants) {
            const base = strict
              ? holdOut(corpus, expected, !dropFromCatalog)
              : corpus;
            const variant = check ? base : { ...base, printing: undefined };
            const [topLeft, topRight, bottomRight, bottomLeft] =
              quadCorners.map(([x, y]) => ({
                x: x / photoWidth,
                y: y / photoHeight,
              }));
            const { recognition } = await recognizeRectified(
              {
                scanId: `synthetic-${expected}-${quadName}`,
                photo,
                quad: parseCardQuad(
                  JSON.stringify({
                    topLeft,
                    topRight,
                    bottomRight,
                    bottomLeft,
                  }),
                ),
              },
              variant,
              runner,
            );
            const decision = recognition.decision;
            const result = {
              group: illustrationId,
              name: card.name,
              expected,
              printing: `${card.set.toUpperCase()} ${card.collectorNumber}`,
              quad: quadName,
              check,
              outcome: !decision.accepted
                ? ("abstained" as const)
                : decision.scryfallId === expected
                  ? ("correct" as const)
                  : ("wrong" as const),
              top: recognition.candidates[0]?.scryfallId ?? null,
              checkChosen: recognition.printingCheck?.chosen,
              reasons: decision.reasons,
              serviceLatencyMs: recognition.serviceLatencyMs,
              printingMs: recognition.printingCheck?.ms ?? null,
              printingCheck: recognition.printingCheck,
            };
            results.push(result);
            console.error(
              [
                result.name.slice(0, 24).padEnd(24),
                result.printing.padEnd(14),
                quadName.padEnd(11),
                check ? "check" : "plain",
                result.outcome.padEnd(9),
                `${recognition.serviceLatencyMs} ms`,
                decision.reasons.join("; ").slice(0, 160),
              ].join("  "),
            );
          }
      }
  } finally {
    await runner.close();
  }
  const percentile = (values: number[], fraction: number) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
  };
  const summarize = (subset: typeof results) => ({
    runs: subset.length,
    correct: subset.filter((result) => result.outcome === "correct").length,
    abstained: subset.filter((result) => result.outcome === "abstained").length,
    wrong: subset.filter((result) => result.outcome === "wrong").length,
    printingTop1: subset.filter((result) => result.top === result.expected)
      .length,
    latencyP50Ms: percentile(
      subset.map((result) => result.serviceLatencyMs),
      0.5,
    ),
    latencyP95Ms: percentile(
      subset.map((result) => result.serviceLatencyMs),
      0.95,
    ),
    printingP95Ms: percentile(
      subset.flatMap((result) =>
        result.printingMs === null ? [] : [result.printingMs],
      ),
      0.95,
    ),
  });
  const summary = {
    seed,
    holdOutExpected: strict,
    droppedFromCatalog: dropFromCatalog,
    groups: groups.length,
    printings: new Set(results.map((result) => result.expected)).size,
    ...Object.fromEntries(
      [true, false].map((check) => [
        check ? "withCheck" : "withoutCheck",
        {
          all: summarize(results.filter((result) => result.check === check)),
          byQuad: Object.fromEntries(
            ["true", "jitter", "inner-frame"].map((quad) => [
              quad,
              summarize(
                results.filter(
                  (result) => result.check === check && result.quad === quad,
                ),
              ),
            ]),
          ),
          byGroup: Object.fromEntries(
            groups.map(([illustrationId, members]) => [
              `${byId.get(members[0]!)!.name} (${illustrationId.slice(0, 8)})`,
              summarize(
                results.filter(
                  (result) =>
                    result.check === check && result.group === illustrationId,
                ),
              ),
            ]),
          ),
        },
      ]),
    ),
  };
  await fs.writeFile(
    path.join(
      rectifiedRoot,
      `printing-evaluation-seed${seed}${strict ? "-held-out" : ""}${dropFromCatalog ? "-from-catalog" : ""}${nameFilter ? `-${nameFilter.replace(/[^a-z0-9]+/gi, "-")}` : ""}.json`,
    ),
    JSON.stringify({ summary, results }, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
} else if (command === "report")
  console.log(JSON.stringify(await generateReport(), null, 2));
else {
  console.error(
    "Commands: corpus:prepare [--benchmark|--personal], select:manifest [--input path] [--size 30..50], report, geometric-evaluate [--outcomes path --captures path --corpus path --output path], rectified-prepare [--collection path --manifest path], rectified-evaluate [--set offline|phone --quads path --truth path --rotate 0|90|180|270 --crops directory --repeat n --workers n --hold-out-expected], rectified-printing-evaluate [--seed n --deck path --name text --hold-out-expected --drop-from-catalog --check-only]",
  );
  process.exitCode = 1;
}

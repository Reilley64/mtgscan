import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const flags = new Set(process.argv.slice(2).filter((argument) => argument.startsWith("--")));
const [labelsPath, catalogArgument] = process.argv.slice(2).filter((argument) => !argument.startsWith("--"));
if (!labelsPath) {
  console.error("usage: node scripts/evaluate-crops.mjs <labels.json> [catalog-dir] [--held-out] [--details]");
  process.exit(1);
}
const heldOut = flags.has("--held-out");
const catalogDirectory = path.resolve(catalogArgument ?? path.join(projectRoot, ".data", "catalog"));
const helper = process.env.CATALOG_RECOGNIZER_BIN ?? path.join(projectRoot, ".build", "mtg-catalog-recognizer");
const { cards, nonCards = [] } = JSON.parse(await fs.readFile(labelsPath, "utf8"));
const catalog = JSON.parse(await fs.readFile(path.join(catalogDirectory, "catalog.json"), "utf8"));
const oracleById = new Map(catalog.map((printing) => [printing.id, printing.oracleId]));
const requests = [
  ...cards.map((card, index) => ({
    requestId: `card-${index}`,
    ...(card.photo ? { photoPath: card.photo, quad: card.quad } : { cropPath: card.crop }),
    ...(heldOut ? { excludeIds: [card.scryfallId] } : {}),
    truth: card.scryfallId,
    group: card.group ?? null,
  })),
  ...nonCards.map((crop, index) => ({ requestId: `non-card-${index}`, cropPath: crop, truth: null, group: null })),
];

const child = spawn(helper, ["serve", catalogDirectory], { stdio: ["pipe", "pipe", "inherit"] });
const responses = new Map();
const finished = new Promise((resolve) => {
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    if (message.requestId) responses.set(message.requestId, message);
    if (responses.size === requests.length) resolve();
  });
});
for (const { truth: _truth, group: _group, ...request } of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
await finished;
child.stdin.end();

const totals = { truthInTop5: 0, cards: 0, nameTop1: 0, printingTop1: 0, accepted: 0, correctAccepts: 0, falseAccepts: 0, nonCards: 0, nonCardsRejected: 0 };
const latencies = [];
const falseAccepts = [];
const acceptReasons = {};
const groups = {};
for (const request of requests) {
  const recognition = responses.get(request.requestId)?.recognition;
  if (!recognition) continue;
  latencies.push(Object.entries(recognition.stageMs).reduce((sum, [, value]) => sum + value, 0));
  const top = recognition.candidates[0]?.scryfallId;
  if (request.truth === null) {
    totals.nonCards += 1;
    if (recognition.decision.reasons.some((reason) => reason.startsWith("not a card"))) totals.nonCardsRejected += 1;
    continue;
  }
  totals.cards += 1;
  const group = (groups[request.group ?? "all"] ??= { cards: 0, accepted: 0, correct: 0, false: 0 });
  group.cards += 1;
  if (top === request.truth) totals.printingTop1 += 1;
  if (recognition.candidates.some((candidate) => candidate.scryfallId === request.truth)) totals.truthInTop5 += 1;
  if (top && oracleById.get(top) === oracleById.get(request.truth)) totals.nameTop1 += 1;
  if (recognition.decision.accepted) {
    totals.accepted += 1;
    group.accepted += 1;
    const reason = recognition.decision.reasons[0].replace(/[0-9.]+/g, "#").replace(/collector line [A-Z0-9#]+ [^ ]+/, "collector line X");
    acceptReasons[reason] = (acceptReasons[reason] ?? 0) + 1;
    if (recognition.decision.scryfallId === request.truth && !heldOut) {
      totals.correctAccepts += 1;
      group.correct += 1;
    } else {
      totals.falseAccepts += 1;
      group.false += 1;
      falseAccepts.push({
        input: request.cropPath ?? request.photoPath,
        accepted: recognition.decision.scryfallId,
        truth: request.truth,
        reason: recognition.decision.reasons[0],
        reading: recognition.reading,
        topSimilarity: recognition.topSimilarity,
        truthInCandidates: recognition.candidates.some((candidate) => candidate.scryfallId === request.truth),
      });
    }
  }
}
latencies.sort((a, b) => a - b);
const percentile = (fraction) => Math.round(latencies[Math.min(latencies.length - 1, Math.floor(fraction * latencies.length))]);
const acceptedRows = requests.flatMap((request) => {
  const recognition = responses.get(request.requestId)?.recognition;
  if (!recognition?.decision.accepted || request.truth === null) return [];
  return [
    {
      correct: !heldOut && recognition.decision.scryfallId === request.truth,
      reason: recognition.decision.reasons[0],
      topSimilarity: recognition.topSimilarity,
      group: request.group,
    },
  ];
});
const errors = [...responses.values()].filter((response) => response.error).length;
console.log(
  JSON.stringify(
    {
      catalog: catalog.length,
      heldOut,
      ...totals,
      errors,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      acceptReasons,
      groups,
      falseAcceptList: flags.has("--details") ? falseAccepts : falseAccepts.slice(0, 20),
      ...(flags.has("--details") ? { acceptedRows } : {}),
    },
    null,
    2,
  ),
);

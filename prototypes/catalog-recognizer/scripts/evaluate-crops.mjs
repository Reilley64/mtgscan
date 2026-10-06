import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [labelsPath, catalogArgument] = process.argv.slice(2);
if (!labelsPath) {
  console.error("usage: node scripts/evaluate-crops.mjs <labels.json> [catalog-dir]");
  process.exit(1);
}
const catalogDirectory = path.resolve(catalogArgument ?? path.join(projectRoot, ".data", "catalog"));
const helper = process.env.CATALOG_RECOGNIZER_BIN ?? path.join(projectRoot, ".build", "mtg-catalog-recognizer");
const { cards, nonCards = [] } = JSON.parse(await fs.readFile(labelsPath, "utf8"));
const catalog = JSON.parse(await fs.readFile(path.join(catalogDirectory, "catalog.json"), "utf8"));
const oracleById = new Map(catalog.map((printing) => [printing.id, printing.oracleId]));
const requests = [
  ...cards.map((card) => ({ requestId: card.crop, cropPath: card.crop, truth: card.scryfallId })),
  ...nonCards.map((crop) => ({ requestId: crop, cropPath: crop, truth: null })),
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
for (const { truth: _truth, ...request } of requests) child.stdin.write(`${JSON.stringify(request)}\n`);
await finished;
child.stdin.end();

const totals = { cards: 0, nameTop1: 0, printingTop1: 0, accepted: 0, correctAccepts: 0, falseAccepts: 0, nonCards: 0, nonCardsRejected: 0 };
const latencies = [];
const falseAccepts = [];
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
  if (top === request.truth) totals.printingTop1 += 1;
  if (top && oracleById.get(top) === oracleById.get(request.truth)) totals.nameTop1 += 1;
  if (recognition.decision.accepted) {
    totals.accepted += 1;
    if (recognition.decision.scryfallId === request.truth) totals.correctAccepts += 1;
    else {
      totals.falseAccepts += 1;
      falseAccepts.push({ crop: request.cropPath, accepted: recognition.decision.scryfallId, truth: request.truth });
    }
  }
}
latencies.sort((a, b) => a - b);
const percentile = (fraction) => Math.round(latencies[Math.min(latencies.length - 1, Math.floor(fraction * latencies.length))]);
console.log(JSON.stringify({ catalog: catalog.length, ...totals, p50Ms: percentile(0.5), p95Ms: percentile(0.95), falseAcceptList: falseAccepts }, null, 2));

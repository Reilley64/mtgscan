import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

const usage =
  'usage: bun scripts/evaluate.mjs <labels.json> --gallery <dir> --recognizer <binary> [--held-out] [--details] [--scans] [--workers <n>]';

function parseArguments(argv) {
  const options = { flags: new Set(), positional: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (['--gallery', '--recognizer', '--workers'].includes(argument)) {
      options[argument.slice(2)] = argv[index + 1];
      index += 1;
    } else if (argument.startsWith('--')) {
      options.flags.add(argument);
    } else {
      options.positional.push(argument);
    }
  }
  return options;
}

function startRecognizer(recognizer, galleryDirectory) {
  const child = spawn(recognizer, ['serve', galleryDirectory], { stdio: ['pipe', 'pipe', 'inherit'] });
  const waiting = new Map();
  let ready;
  const readyPromise = new Promise((resolve) => {
    ready = resolve;
  });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    const message = JSON.parse(line);
    if (message.ready !== undefined) ready();
    if (message.requestId) {
      waiting.get(message.requestId)(message);
      waiting.delete(message.requestId);
    }
  });
  return {
    ready: readyPromise,
    send(request) {
      return new Promise((resolve) => {
        waiting.set(request.requestId, resolve);
        child.stdin.write(`${JSON.stringify(request)}\n`);
      });
    },
    stop() {
      child.stdin.end();
    },
  };
}

async function recognizeAll(requests, recognizer, galleryDirectory, workerCount) {
  const workers = Array.from({ length: workerCount }, () => startRecognizer(recognizer, galleryDirectory));
  await Promise.all(workers.map((worker) => worker.ready));
  const responses = new Map();
  let next = 0;
  await Promise.all(
    workers.map(async (worker) => {
      while (next < requests.length) {
        const { input: _input, truth: _truth, group: _group, ...request } = requests[next];
        next += 1;
        responses.set(request.requestId, await worker.send(request));
      }
      worker.stop();
    }),
  );
  return responses;
}

const options = parseArguments(process.argv.slice(2));
const [labelsPath] = options.positional;
if (!labelsPath || !options.gallery || !options.recognizer) {
  console.error(usage);
  process.exit(1);
}
const heldOut = options.flags.has('--held-out');
const galleryDirectory = path.resolve(options.gallery);
const { cards, nonCards = [] } = JSON.parse(await fs.readFile(labelsPath, 'utf8'));
const labelsDirectory = path.dirname(path.resolve(labelsPath));
const inputPath = (file) => path.resolve(labelsDirectory, file);
const printingList = JSON.parse(await fs.readFile(path.join(galleryDirectory, 'catalog.json'), 'utf8'));
const oracleById = new Map(printingList.map((printing) => [printing.id, printing.oracleId]));
const requests = [
  ...cards.map((card, index) => ({
    requestId: `card-${index}`,
    ...(card.photo ? { photoPath: inputPath(card.photo), outline: card.quad } : { cropPath: inputPath(card.crop) }),
    ...(heldOut ? { excludeIds: [card.scryfallId] } : {}),
    input: card.photo ?? card.crop,
    truth: card.scryfallId,
    group: card.group ?? null,
  })),
  ...nonCards.map((crop, index) => ({
    requestId: `non-card-${index}`,
    cropPath: inputPath(crop),
    input: crop,
    truth: null,
    group: null,
  })),
];
const workerCount = Number(options.workers ?? Math.min(4, os.availableParallelism()));
const responses = await recognizeAll(requests, options.recognizer, galleryDirectory, workerCount);

const notACardReason = (recognition) => `not a card: best image similarity ${recognition.topSimilarity.toFixed(3)} is below 0.500`;
const totals = {
  truthInTop5: 0,
  cards: 0,
  nameTop1: 0,
  printingTop1: 0,
  accepted: 0,
  correctAccepts: 0,
  falseAccepts: 0,
  nonCards: 0,
  nonCardsRejected: 0,
};
const latencies = [];
const falseAccepts = [];
const acceptReasons = {};
const groups = {};
const acceptedRows = [];
const scans = [];
for (const request of requests) {
  const response = responses.get(request.requestId);
  const recognition = response?.recognition;
  const candidates = recognition?.kind === 'card' ? recognition.candidates : [];
  const top = candidates[0]?.printingId ?? null;
  const accepted = recognition?.kind === 'card' && recognition.decision.accepted ? top : null;
  const reason =
    recognition?.kind === 'not_a_card' ? notACardReason(recognition) : (recognition?.decision.reasons[0] ?? response?.error ?? null);
  scans.push({ input: request.input, truth: request.truth, group: request.group, top, accepted, reason });
  if (!recognition) continue;
  latencies.push(Object.values(recognition.stageMs).reduce((sum, value) => sum + value, 0));
  if (request.truth === null) {
    totals.nonCards += 1;
    if (recognition.kind === 'not_a_card') totals.nonCardsRejected += 1;
    continue;
  }
  totals.cards += 1;
  const group = (groups[request.group ?? 'all'] ??= { cards: 0, accepted: 0, correct: 0, false: 0 });
  group.cards += 1;
  if (top === request.truth) totals.printingTop1 += 1;
  const truthInCandidates = candidates.some((candidate) => candidate.printingId === request.truth);
  if (truthInCandidates) totals.truthInTop5 += 1;
  if (top && oracleById.get(top) === oracleById.get(request.truth)) totals.nameTop1 += 1;
  if (!accepted) continue;
  totals.accepted += 1;
  group.accepted += 1;
  const acceptReason = reason.replace(/[0-9.]+/g, '#').replace(/collector line [A-Z0-9#]+ [^ ]+/, 'collector line X');
  acceptReasons[acceptReason] = (acceptReasons[acceptReason] ?? 0) + 1;
  const correct = accepted === request.truth && !heldOut;
  acceptedRows.push({ correct, reason, topSimilarity: recognition.topSimilarity, group: request.group });
  if (correct) {
    totals.correctAccepts += 1;
    group.correct += 1;
  } else {
    totals.falseAccepts += 1;
    group.false += 1;
    falseAccepts.push({
      input: request.input,
      accepted,
      truth: request.truth,
      reason,
      reading: recognition.reading,
      topSimilarity: recognition.topSimilarity,
      truthInCandidates,
    });
  }
}
latencies.sort((a, b) => a - b);
const percentile = (fraction) => Math.round(latencies[Math.min(latencies.length - 1, Math.floor(fraction * latencies.length))]);
const errors = [...responses.values()].filter((response) => response.error).length;
const details = options.flags.has('--details');
console.log(
  JSON.stringify(
    {
      catalog: printingList.length,
      heldOut,
      ...totals,
      errors,
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      acceptReasons,
      groups,
      falseAcceptList: details ? falseAccepts : falseAccepts.slice(0, 20),
      ...(details ? { acceptedRows } : {}),
      ...(options.flags.has('--scans') ? { scans } : {}),
    },
    null,
    2,
  ),
);

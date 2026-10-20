import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  buildRecognizer,
  dataDirectory,
  moduleRoot,
  printingListFile,
  run,
  vectorsFile,
} from './recognizer-command.mjs';

const evidence = path.resolve(moduleRoot, '..', '..', 'test', 'scanner-evidence');
const largeImagesDirectory = path.resolve(process.env.RECOGNIZER_LARGE_IMAGES_DIR ?? path.join(dataDirectory, 'large'));
const simulatedDirectory = path.resolve(process.env.RECOGNIZER_SIMULATED_DIR ?? path.join(dataDirectory, 'simulated'));
const reportsDirectory = path.join(dataDirectory, 'reports');
const galleryDirectory = process.env.RECOGNIZER_GALLERY_DIR && path.resolve(process.env.RECOGNIZER_GALLERY_DIR);
let recognizer;
const realOnly = process.argv.includes('--real-only');
const recordFeaturePrints = process.argv.includes('--record-feature-prints');
const baselineArgument = process.argv.indexOf('--baseline');
const baselineDirectory = baselineArgument === -1 ? null : path.resolve(process.argv[baselineArgument + 1]);
const featurePrintsFile = path.join(evidence, 'real', 'feature-prints.json');
const parityReferenceCount = 24;
const parityMinimumCosine = 0.98;

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(file)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')));
  });
}

async function galleryMatchesRecording() {
  const { recordedWith } = JSON.parse(await fs.readFile(path.join(evidence, 'real', 'expected-full.json'), 'utf8'));
  const [printingList, vectors] = await Promise.all([
    sha256(path.join(galleryDirectory, printingListFile)),
    sha256(path.join(galleryDirectory, vectorsFile)).catch(() => null),
  ]);
  return printingList === recordedWith.gallery.catalogJsonSha256 && vectors === recordedWith.gallery.galleryF16Sha256;
}

async function featurePrints(crops) {
  const result = await run(recognizer, ['feature-prints', ...crops.map((crop) => path.join(evidence, 'real', crop))], { output: true });
  if (result.code !== 0) throw new Error('the feature prints did not compute');
  return result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line).vector);
}

function decode(vector) {
  const bytes = Buffer.from(vector, 'base64');
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
}

function cosine(a, b) {
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    aa += a[index] * a[index];
    bb += b[index] * b[index];
  }
  return dot / Math.sqrt(aa * bb);
}

async function recordReferenceFeaturePrints() {
  const { cards } = JSON.parse(await fs.readFile(path.join(evidence, 'real', 'labels.json'), 'utf8'));
  const step = cards.length / parityReferenceCount;
  const crops = Array.from({ length: parityReferenceCount }, (_, index) => cards[Math.floor(index * step)].crop);
  const vectors = await featurePrints(crops);
  const { stdout: macOS } = await run('sw_vers', ['-productVersion'], { output: true });
  const { stdout: machine } = await run('sysctl', ['-n', 'machdep.cpu.brand_string'], { output: true });
  const recording = {
    recordedWith: {
      featurePrint: 'VNGenerateImageFeaturePrintRequest revision 2, scaleFill, 768 values',
      machine: `${machine.trim()}, macOS ${macOS.trim()}`,
      recordedOn: new Date().toISOString().slice(0, 10),
    },
    references: crops.map((crop, index) => ({ crop, vector: vectors[index] })),
  };
  await fs.writeFile(featurePrintsFile, `${JSON.stringify(recording, null, 1)}\n`);
}

async function compareFeaturePrints() {
  const { recordedWith, references } = JSON.parse(await fs.readFile(featurePrintsFile, 'utf8'));
  const vectors = await featurePrints(references.map((reference) => reference.crop));
  const cosines = references.map((reference, index) => cosine(decode(reference.vector), decode(vectors[index])));
  const lowest = Math.min(...cosines);
  return {
    recordedWith: recordedWith.machine,
    references: cosines.length,
    lowestCosine: Number(lowest.toFixed(6)),
    meanCosine: Number((cosines.reduce((sum, value) => sum + value, 0) / cosines.length).toFixed(6)),
    identical: cosines.filter((value) => value === 1).length,
    pass: lowest >= parityMinimumCosine,
  };
}

async function mismatchedSimulatedScans(recorded) {
  const mismatched = [];
  for (const [hash, photo] of recorded) {
    const file = path.join(simulatedDirectory, photo);
    if (!existsSync(file) || (await sha256(file)) !== hash) mismatched.push(photo);
  }
  return mismatched;
}

async function renderSimulatedScans() {
  const recorded = (await fs.readFile(path.join(evidence, 'simulated', 'photos.sha256'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => line.split(/\s+/));
  if (existsSync(path.join(simulatedDirectory, 'labels.json')) && (await mismatchedSimulatedScans(recorded)).length === 0) {
    return { photos: recorded.length, mismatched: [] };
  }
  const render = await run('uv', [
    'run',
    path.join(evidence, 'simulated', 'simulate.py'),
    '--cards',
    path.join(evidence, 'simulated', 'cards.json'),
    '--images',
    largeImagesDirectory,
    '--output',
    simulatedDirectory,
  ]);
  if (render.code !== 0) throw new Error('the simulated scans did not render');
  return { photos: recorded.length, mismatched: await mismatchedSimulatedScans(recorded) };
}

async function runGate({ name, labels, expected, flags }) {
  const evaluation = await run(
    'bun',
    [path.join(moduleRoot, 'scripts', 'evaluate.mjs'), labels, '--gallery', galleryDirectory, '--recognizer', recognizer, ...flags],
    { output: true },
  );
  if (evaluation.code !== 0) return { name, against: null, exitCode: 1, report: null, error: 'the evaluation did not finish' };
  const resultFile = path.join(reportsDirectory, `${name}.json`);
  await fs.writeFile(resultFile, evaluation.stdout);
  const baseline = baselineDirectory && path.join(baselineDirectory, `${name}.json`);
  const comparedWith = baseline && existsSync(baseline) ? baseline : expected;
  const check = await run('bun', [path.join(evidence, 'check.mjs'), comparedWith, resultFile, galleryDirectory], { output: true });
  await fs.writeFile(path.join(reportsDirectory, `${name}-check.json`), check.stdout);
  const against = comparedWith === expected ? 'expected file' : 'baseline';
  if (!check.stdout.trim()) return { name, against, exitCode: 1, report: null, error: 'the check did not finish' };
  return { name, against, exitCode: check.code, report: JSON.parse(check.stdout) };
}

if (recordFeaturePrints) {
  await fs.mkdir(dataDirectory, { recursive: true });
  recognizer = await buildRecognizer();
  await recordReferenceFeaturePrints();
  process.exit(0);
}
if (!galleryDirectory) {
  console.error('Set RECOGNIZER_GALLERY_DIR to the folder that `bun run gallery install` wrote, such as ~/Library/Caches/mtgscan/gallery/installed/20261012-cf1753. See test/scanner-evidence/README.md.');
  process.exit(1);
}
if (!existsSync(path.join(galleryDirectory, printingListFile))) {
  console.error(`No gallery in ${galleryDirectory}. See test/scanner-evidence/README.md.`);
  process.exit(1);
}
await fs.mkdir(reportsDirectory, { recursive: true });
recognizer = await buildRecognizer();
const parity = await compareFeaturePrints();
const sameGallery = await galleryMatchesRecording();
const gates = [
  {
    name: 'real-full',
    labels: path.join(evidence, 'real', 'labels.json'),
    expected: path.join(evidence, 'real', 'expected-full.json'),
    flags: ['--details', '--scans'],
  },
  {
    name: 'real-held-out',
    labels: path.join(evidence, 'real', 'labels.json'),
    expected: path.join(evidence, 'real', 'expected-held-out.json'),
    flags: ['--held-out', '--details', '--scans'],
  },
];
let simulation = null;
if (!realOnly) {
  simulation = await renderSimulatedScans();
  gates.push(
    {
      name: 'simulated-full',
      labels: path.join(simulatedDirectory, 'labels.json'),
      expected: path.join(evidence, 'simulated', 'expected-full.json'),
      flags: ['--details', '--scans'],
    },
    {
      name: 'simulated-held-out',
      labels: path.join(simulatedDirectory, 'labels.json'),
      expected: path.join(evidence, 'simulated', 'expected-held-out.json'),
      flags: ['--held-out', '--details'],
    },
  );
}
const results = [];
for (const gate of gates) {
  console.error(`Running ${gate.name}`);
  results.push(await runGate(gate));
}
const failed = !parity.pass || simulation?.mismatched.length > 0 || results.some((result) => result.exitCode === 1);
const exitCode = failed ? 1 : results.some((result) => result.exitCode === 2) ? 2 : 0;
console.log(
  JSON.stringify(
    {
      featurePrintParity: parity,
      galleryMatchesRecording: sameGallery,
      simulatedPhotos: simulation && { photos: simulation.photos, mismatched: simulation.mismatched.length },
      gates: results.map(({ name, against, exitCode: code, report, error }) => ({
        name,
        comparedWith: against,
        exitCode: code,
        failedGates: report?.gates.filter((gate) => !gate.pass).map((gate) => gate.gate) ?? [error],
        failedSafetyGates: report?.gates.filter((gate) => !gate.pass && gate.kind === 'safety').map((gate) => gate.gate) ?? [error],
        changedMeasures: report?.totalChanges.length ?? null,
        changedScans: Array.isArray(report?.scanChanges) ? report.scanChanges.length : null,
      })),
      reports: reportsDirectory,
      exitCode,
    },
    null,
    2,
  ),
);
process.exit(exitCode);

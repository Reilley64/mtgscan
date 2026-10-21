import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { parseArgs } from 'node:util';

import type { FrameQuad } from '../index';
import { heldStillSample } from '../../../test/scanner-evidence/detector/clips';
import {
  branchAloneTable,
  compareReplays,
  replayTable,
  scoreReplay,
  type FrameLabels,
  type FrameSample,
} from '../../../test/scanner-evidence/detector/score';

const moduleRoot = path.resolve(import.meta.dirname, '..');
const recipeDirectory = path.resolve(moduleRoot, '..', '..', 'test', 'scanner-evidence', 'detector');
const hashListFile = path.join(recipeDirectory, 'frames.sha256');
const dataDirectory = path.join(moduleRoot, '.data');
const framesDirectory = path.join(dataDirectory, 'frames');
const imagesDirectory = path.resolve(process.env.DETECTOR_IMAGES_DIR ?? path.join(dataDirectory, 'images'));
const texturesDirectory = path.join(dataDirectory, 'textures');
const reportsDirectory = path.join(dataDirectory, 'reports');
const comparedSources = [path.join('ios', 'Detector'), path.join('macos', 'CardDetectorCommand')];

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'origin/main' },
    rounds: { type: 'string', default: '3' },
    'record-frame-hashes': { type: 'boolean', default: false },
  },
});

function runProcess(command: string, args: string[], { cwd, output }: { cwd?: string; output?: boolean } = {}) {
  return new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', output ? 'pipe' : process.stderr, 'inherit'] });
    const chunks: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') }));
  });
}

async function git(args: string[]) {
  const result = await runProcess('git', args, { cwd: moduleRoot, output: true });
  if (result.code !== 0) throw new Error(`git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

async function frameHashes() {
  const files = (await fs.readdir(framesDirectory))
    .filter((file) => file.endsWith('.png') || file.endsWith('.jpg') || file === 'labels.json')
    .sort();
  const lines = await Promise.all(
    files.map(async (file) => `${createHash('sha256').update(await fs.readFile(path.join(framesDirectory, file))).digest('hex')}  ${file}`),
  );
  return `${lines.join('\n')}\n`;
}

async function mismatchedFrames(recorded: string) {
  const actual = new Set(existsSync(framesDirectory) ? (await frameHashes()).split('\n') : []);
  return recorded
    .split('\n')
    .filter((line) => line && !actual.has(line))
    .map((line) => line.split(/\s+/)[1]);
}

async function renderFrames() {
  const recorded = values['record-frame-hashes'] ? '' : await fs.readFile(hashListFile, 'utf8');
  if (recorded && (await mismatchedFrames(recorded)).length === 0) return [];
  await fs.rm(framesDirectory, { recursive: true, force: true });
  const render = await runProcess('uv', [
    'run',
    path.join(recipeDirectory, 'frames.py'),
    '--cards',
    path.join(recipeDirectory, 'cards.json'),
    '--images',
    imagesDirectory,
    '--textures',
    path.join(recipeDirectory, 'textures.json'),
    '--texture-images',
    texturesDirectory,
    '--output',
    framesDirectory,
  ]);
  if (render.code !== 0) throw new Error('the detector replay frames did not render');
  if (!recorded) {
    await fs.writeFile(hashListFile, await frameHashes());
    return [];
  }
  return mismatchedFrames(recorded);
}

async function buildCommand(packageRoot: string, scratch: string) {
  const build = await runProcess('swift', [
    'build',
    '-c',
    'release',
    '--product',
    'card-detector',
    '-Xswiftc',
    '-enable-testing',
    '--package-path',
    packageRoot,
    '--scratch-path',
    scratch,
  ]);
  if (build.code !== 0) throw new Error(`the detector command did not build in ${packageRoot}`);
  return path.join(scratch, 'release', 'card-detector');
}

async function exportBasePackage(commit: string) {
  const repositoryRoot = await git(['rev-parse', '--show-toplevel']);
  const modulePath = path.relative(repositoryRoot, moduleRoot);
  const stepMode = await runProcess('git', ['grep', '--quiet', '--fixed-strings', '"step"', commit, '--', path.join(modulePath, comparedSources[1])], {
    cwd: repositoryRoot,
  });
  if (stepMode.code !== 0) return null;
  const directory = path.join(dataDirectory, 'base', commit);
  const packageRoot = path.join(directory, 'package');
  await fs.rm(packageRoot, { recursive: true, force: true });
  await fs.mkdir(packageRoot, { recursive: true });
  const archive = path.join(directory, 'package.tar');
  const packageFiles = ['Package.swift', 'ios/Detector', 'macos'].map((file) => path.join(modulePath, file));
  const written = await runProcess('git', ['archive', '--output', archive, commit, ...packageFiles], { cwd: repositoryRoot });
  if (written.code !== 0) throw new Error(`git archive ${commit} failed`);
  const unpacked = await runProcess('tar', ['-x', '-f', archive, '-C', packageRoot, '--strip-components', String(modulePath.split(path.sep).length)]);
  if (unpacked.code !== 0) throw new Error('the merge base package did not unpack');
  return { packageRoot, scratch: path.join(directory, 'build') };
}

async function sourceFiles(packageRoot: string) {
  const files = await Promise.all(
    comparedSources.map(async (directory) =>
      Promise.all(
        (await fs.readdir(path.join(packageRoot, directory))).sort().map(async (file) => [
          path.join(directory, file),
          await fs.readFile(path.join(packageRoot, directory, file), 'utf8'),
        ]),
      ),
    ),
  );
  return JSON.stringify(files);
}

type PhotoOutlineRecord = { outline: FrameQuad; outcome: string; durationMs: number };
type ReplayFrame = { frame: string; intrinsicMatrix: number[][] };

function startCommand(command: string, frames: ReplayFrame[]) {
  const child = spawn(command, ['step', ...frames.map(({ frame }) => frame)], {
    cwd: framesDirectory,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const lines = readline.createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  async function ask(request: string) {
    child.stdin.write(`${request}\n`);
    const line = await lines.next();
    if (line.done) throw new Error(`${command} stopped`);
    return JSON.parse(line.value) as unknown;
  }
  return {
    detect: async (index: number) => (await ask(`${index} ${frames[index].intrinsicMatrix.flat().join(' ')}`)) as FrameSample,
    refine: async (index: number, photo: string, outline: FrameQuad) =>
      (await ask(JSON.stringify({ refine: index, photo, outline, intrinsicMatrix: frames[index].intrinsicMatrix }))) as PhotoOutlineRecord,
    stop: () => child.stdin.end(),
  };
}

async function refinePhotos(side: ReturnType<typeof startCommand>, frames: ReplayFrame[], labels: FrameLabels, samples: FrameSample[]) {
  const byFrame = new Map(samples.map((sample) => [sample.frame, sample]));
  const records = new Map<string, PhotoOutlineRecord>();
  for (const clip of labels.clips) {
    const heldStill = heldStillSample(clip, clip.frames.map((frame) => byFrame.get(frame.frame)!));
    if (!heldStill?.sample.corners) continue;
    const frame = frames.findIndex(({ frame }) => frame === clip.frames[heldStill.index].frame);
    records.set(clip.clip, await side.refine(frame, clip.photo.frame, heldStill.sample.corners));
  }
  return records;
}

async function detectInterleaved(commands: string[], labels: FrameLabels, rounds: number) {
  const frames = [...labels.frames, ...labels.clips.flatMap((clip) => clip.frames)];
  const sides = commands.map((command) => startCommand(command, frames));
  const samples = sides.map(() => Array.from({ length: rounds }, (): FrameSample[] => []));
  for (let round = 0; round < rounds; round += 1) {
    const roundFrames = round === 0 ? frames.length : labels.frames.length;
    for (let index = 0; index < roundFrames; index += 1) {
      const order = (round + index) % 2 === 0 ? sides.keys() : [...sides.keys()].reverse();
      for (const side of order) samples[side][round].push(await sides[side].detect(index));
    }
  }
  const photoOutlines = await Promise.all(sides.map((side, index) => refinePhotos(side, frames, labels, samples[index][0])));
  sides.forEach((side) => side.stop());
  return { samples, photoOutlines };
}

function photoRefinementLine(name: string, records: Map<string, PhotoOutlineRecord>) {
  const outcomes = new Map<string, number>();
  for (const { outcome } of records.values()) outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
  const durations = [...records.values()].map((record) => record.durationMs).sort((a, b) => a - b);
  const counts = [...outcomes].map(([outcome, count]) => `${count} ${outcome.replace('_', ' ')}`).join(', ');
  return `Photo refinement on the ${name}: ${counts}, of ${records.size} clips that ask for a photo. Median ${durations[Math.floor(durations.length / 2)].toFixed(0)} ms on the Mac.`;
}

const outlinesOf = (records: Map<string, PhotoOutlineRecord>) => new Map([...records].map(([clip, record]) => [clip, record.outline]));

async function writeReports(report: string, scores: Record<string, unknown>) {
  await fs.rm(reportsDirectory, { recursive: true, force: true });
  await fs.mkdir(reportsDirectory, { recursive: true });
  await Promise.all([
    ...Object.entries(scores).map(([name, score]) => fs.writeFile(path.join(reportsDirectory, `${name}.json`), `${JSON.stringify(score, null, 1)}\n`)),
    fs.writeFile(path.join(reportsDirectory, 'comparison.md'), report),
  ]);
  console.log(report);
}

const mismatched = await renderFrames();
if (values['record-frame-hashes']) {
  console.log(`Recorded ${path.relative(process.cwd(), hashListFile)}`);
  process.exit(0);
}
if (mismatched.length > 0) {
  console.error(
    `${mismatched.length} rendered frames do not match frames.sha256, first: ${mismatched[0]}. This Mac renders other frame bytes than the recorded ones, or the recipe changed without --record-frame-hashes.`,
  );
  process.exit(1);
}
const labels = JSON.parse(await fs.readFile(path.join(framesDirectory, 'labels.json'), 'utf8')) as FrameLabels;
const baseCommit = await git(['merge-base', 'HEAD', values.base!]);
const branchCommit = await git(['rev-parse', '--short', 'HEAD']);
console.error('Building the detector command on the branch');
const branchCommand = await buildCommand(moduleRoot, path.join(dataDirectory, 'build'));
const basePackage = await exportBasePackage(baseCommit);

if (!basePackage) {
  console.error(`The merge base ${baseCommit.slice(0, 7)} has no detector replay`);
  const {
    samples: [branchRounds],
    photoOutlines: [branchPhotos],
  } = await detectInterleaved([branchCommand], labels, Number(values.rounds));
  const branch = scoreReplay(labels, branchRounds, outlinesOf(branchPhotos));
  const { table, pass } = branchAloneTable(branch);
  await writeReports(
    [
      `The merge base ${baseCommit.slice(0, 7)} with ${values.base} has no detector replay, so the branch at ${branchCommit} runs alone against fixed limits, ${values.rounds} timing rounds.`,
      '',
      table,
      photoRefinementLine('branch', branchPhotos),
      '',
    ].join('\n'),
    { branch },
  );
  process.exit(pass ? 0 : 1);
}

console.error(`Building the detector command on the merge base ${baseCommit.slice(0, 7)}`);
const baseCommand = await buildCommand(basePackage.packageRoot, basePackage.scratch);
const sameDetector = (await sourceFiles(moduleRoot)) === (await sourceFiles(basePackage.packageRoot));
const {
  samples: [baseRounds, branchRounds],
  photoOutlines: [basePhotos, branchPhotos],
} = await detectInterleaved([baseCommand, branchCommand], labels, Number(values.rounds));
const base = scoreReplay(labels, baseRounds, outlinesOf(basePhotos));
const branch = scoreReplay(labels, branchRounds, outlinesOf(branchPhotos));
const comparison = compareReplays(base, branch, { sameDetector });
await writeReports(
  [
    `The branch at ${branchCommit} against the merge base ${baseCommit.slice(0, 7)} with ${values.base}, ${values.rounds} timing rounds.`,
    '',
    replayTable(comparison),
    photoRefinementLine('merge base', basePhotos),
    '',
    photoRefinementLine('branch', branchPhotos),
    '',
  ].join('\n'),
  { base, branch },
);
process.exit(comparison.pass ? 0 : 1);

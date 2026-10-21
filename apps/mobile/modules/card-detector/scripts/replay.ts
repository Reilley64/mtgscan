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
const photoOutlineSource = path.join(comparedSources[0], 'PhotoOutline.swift');

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'origin/main' },
    rounds: { type: 'string', default: '3' },
    'record-frame-hashes': { type: 'boolean', default: false },
  },
});

function run(command: string, args: string[], { cwd, output }: { cwd?: string; output?: boolean } = {}) {
  return new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: ['ignore', output ? 'pipe' : process.stderr, 'inherit'] });
    const chunks: Buffer[] = [];
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') }));
  });
}

async function git(args: string[]) {
  const result = await run('git', args, { cwd: moduleRoot, output: true });
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
  const render = await run('uv', [
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
  const build = await run('swift', [
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
  const directory = path.join(dataDirectory, 'base', commit);
  const packageRoot = path.join(directory, 'package');
  await fs.rm(packageRoot, { recursive: true, force: true });
  await fs.mkdir(packageRoot, { recursive: true });
  const archive = path.join(directory, 'package.tar');
  const packageFiles = ['Package.swift', 'ios/Detector', 'macos'].map((file) => path.join(modulePath, file));
  const written = await run('git', ['archive', '--output', archive, commit, ...packageFiles], { cwd: repositoryRoot });
  if (written.code !== 0) throw new Error(`git archive ${commit} failed`);
  const unpacked = await run('tar', ['-x', '-f', archive, '-C', packageRoot, '--strip-components', String(modulePath.split(path.sep).length)]);
  if (unpacked.code !== 0) throw new Error('the merge base package did not unpack');
  const baseCommandFile = path.join(packageRoot, comparedSources[1], 'main.swift');
  const baseCommand = existsSync(baseCommandFile) ? await fs.readFile(baseCommandFile, 'utf8') : '';
  if (!baseCommand.includes('case "step"')) {
    await fs.cp(path.join(moduleRoot, 'Package.swift'), path.join(packageRoot, 'Package.swift'));
    await fs.cp(path.join(moduleRoot, comparedSources[1]), path.join(packageRoot, comparedSources[1]), { recursive: true });
    await fs.cp(path.join(moduleRoot, photoOutlineSource), path.join(packageRoot, photoOutlineSource));
  }
  return {
    packageRoot,
    scratch: path.join(directory, 'build'),
    refines: baseCommand.includes('case "refine"'),
    takesIntrinsicMatrix: baseCommand.includes('intrinsicMatrix'),
  };
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

function startCommand(command: string, frames: ReplayFrame[], takesIntrinsicMatrix: boolean) {
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
    detect: async (index: number) =>
      (await ask(takesIntrinsicMatrix ? `${index} ${frames[index].intrinsicMatrix.flat().join(' ')}` : String(index))) as FrameSample,
    refine: async (index: number, photo: string, outline: FrameQuad) =>
      (await ask(JSON.stringify({ refine: index, photo, outline }))) as PhotoOutlineRecord,
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

async function detectInterleaved(
  commands: { command: string; refines: boolean; takesIntrinsicMatrix: boolean }[],
  labels: FrameLabels,
  rounds: number,
) {
  const frames = [...labels.frames, ...labels.clips.flatMap((clip) => clip.frames)];
  const sides = commands.map(({ command, takesIntrinsicMatrix }) => startCommand(command, frames, takesIntrinsicMatrix));
  const samples = sides.map(() => Array.from({ length: rounds }, (): FrameSample[] => []));
  for (let round = 0; round < rounds; round += 1) {
    const roundFrames = round === 0 ? frames.length : labels.frames.length;
    for (let index = 0; index < roundFrames; index += 1) {
      const order = (round + index) % 2 === 0 ? sides.keys() : [...sides.keys()].reverse();
      for (const side of order) samples[side][round].push(await sides[side].detect(index));
    }
  }
  const photoOutlines = await Promise.all(
    sides.map((side, index) => (commands[index].refines ? refinePhotos(side, frames, labels, samples[index][0]) : new Map<string, PhotoOutlineRecord>())),
  );
  sides.forEach((side) => side.stop());
  return { samples, photoOutlines };
}

function photoRefinementLine(name: string, records: Map<string, PhotoOutlineRecord>) {
  if (records.size === 0) return `Photo refinement on the ${name}: none, its detector command has no refine mode.`;
  const outcomes = new Map<string, number>();
  for (const { outcome } of records.values()) outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
  const durations = [...records.values()].map((record) => record.durationMs).sort((a, b) => a - b);
  const counts = [...outcomes].map(([outcome, count]) => `${count} ${outcome.replace('_', ' ')}`).join(', ');
  return `Photo refinement on the ${name}: ${counts}, of ${records.size} clips that ask for a photo. Median ${durations[Math.floor(durations.length / 2)].toFixed(0)} ms on the Mac.`;
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
console.error('Building the detector command on the branch');
const branchCommand = await buildCommand(moduleRoot, path.join(dataDirectory, 'build'));
console.error(`Building the detector command on the merge base ${baseCommit.slice(0, 7)}`);
const basePackage = await exportBasePackage(baseCommit);
const baseCommand = await buildCommand(basePackage.packageRoot, basePackage.scratch);
const sameDetector = (await sourceFiles(moduleRoot)) === (await sourceFiles(basePackage.packageRoot));
const {
  samples: [baseRounds, branchRounds],
  photoOutlines: [basePhotos, branchPhotos],
} = await detectInterleaved(
  [
    { command: baseCommand, refines: basePackage.refines, takesIntrinsicMatrix: basePackage.takesIntrinsicMatrix },
    { command: branchCommand, refines: true, takesIntrinsicMatrix: true },
  ],
  labels,
  Number(values.rounds),
);
const outlinesOf = (records: Map<string, PhotoOutlineRecord>) => new Map([...records].map(([clip, record]) => [clip, record.outline]));
const base = scoreReplay(labels, baseRounds, outlinesOf(basePhotos));
const branch = scoreReplay(labels, branchRounds, outlinesOf(branchPhotos));
const comparison = compareReplays(base, branch, { sameDetector });
const report = [
  `The branch at ${await git(['rev-parse', '--short', 'HEAD'])} against the merge base ${baseCommit.slice(0, 7)} with ${values.base}, ${values.rounds} timing rounds.`,
  '',
  replayTable(comparison),
  photoRefinementLine('merge base', basePhotos),
  '',
  photoRefinementLine('branch', branchPhotos),
  '',
].join('\n');
await fs.mkdir(reportsDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(reportsDirectory, 'base.json'), `${JSON.stringify(base, null, 1)}\n`),
  fs.writeFile(path.join(reportsDirectory, 'branch.json'), `${JSON.stringify(branch, null, 1)}\n`),
  fs.writeFile(path.join(reportsDirectory, 'comparison.md'), report),
]);
console.log(report);
process.exit(comparison.pass ? 0 : 1);

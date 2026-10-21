import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

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

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'origin/main' },
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
  if (!existsSync(path.join(packageRoot, comparedSources[1]))) {
    await fs.cp(path.join(moduleRoot, 'Package.swift'), path.join(packageRoot, 'Package.swift'));
    await fs.cp(path.join(moduleRoot, comparedSources[1]), path.join(packageRoot, comparedSources[1]), { recursive: true });
  }
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

async function detect(command: string, labels: FrameLabels) {
  const frames = [...labels.frames, ...labels.clips.flatMap((clip) => clip.frames)].map((frame) => frame.frame);
  const result = await run(command, ['frames', ...frames], { cwd: framesDirectory, output: true });
  if (result.code !== 0) throw new Error(`${command} did not finish`);
  return result.stdout
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as FrameSample);
}

const mismatched = await renderFrames();
if (values['record-frame-hashes']) {
  console.log(`Recorded ${path.relative(process.cwd(), hashListFile)}`);
  process.exit(0);
}
if (mismatched.length > 0) {
  console.error(`${mismatched.length} rendered frames do not match frames.sha256, first: ${mismatched[0]}`);
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
const base = scoreReplay(labels, await detect(baseCommand, labels));
const branch = scoreReplay(labels, await detect(branchCommand, labels));
const comparison = compareReplays(base, branch, { sameDetector });
const table = replayTable(comparison);
await fs.mkdir(reportsDirectory, { recursive: true });
await Promise.all([
  fs.writeFile(path.join(reportsDirectory, 'base.json'), `${JSON.stringify(base, null, 1)}\n`),
  fs.writeFile(path.join(reportsDirectory, 'branch.json'), `${JSON.stringify(branch, null, 1)}\n`),
  fs.writeFile(path.join(reportsDirectory, 'comparison.md'), table),
]);
console.log(`Detector replay: the branch at ${(await git(['rev-parse', '--short', 'HEAD']))} against the merge base ${baseCommit.slice(0, 7)} with ${values.base}\n`);
console.log(table);
process.exit(comparison.pass ? 0 : 1);

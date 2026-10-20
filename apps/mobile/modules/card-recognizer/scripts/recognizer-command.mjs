import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const dataDirectory = path.resolve(process.env.RECOGNIZER_DATA_DIR ?? path.join(moduleRoot, '.data'));

export const printingListFile = 'catalog.json';
export const vectorsFile = 'gallery.f16';

export function run(command, args, { output } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', output ? 'pipe' : process.stderr, 'inherit'] });
    const chunks = [];
    child.stdout?.on('data', (chunk) => chunks.push(chunk));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(chunks).toString('utf8') }));
  });
}

export async function buildRecognizer() {
  const scratch = path.join(dataDirectory, 'build');
  const build = await run('swift', ['build', '-c', 'release', '--package-path', moduleRoot, '--scratch-path', scratch]);
  if (build.code !== 0) throw new Error('the macOS recognizer command did not build');
  return path.join(scratch, 'release', 'card-recognizer');
}

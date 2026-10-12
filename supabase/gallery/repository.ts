import { existsSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = join(import.meta.dir, '..', '..');
const recognizerSources = 'apps/mobile/modules/card-recognizer';
const evidenceFile = join(repositoryRoot, 'apps/mobile/test/scanner-evidence/real/expected-full.json');

async function git(args: string[]): Promise<string> {
  const child = Bun.spawn(['git', ...args], { cwd: repositoryRoot, stdout: 'pipe', stderr: 'ignore' });
  const [output, exitCode] = await Promise.all([new Response(child.stdout).text(), child.exited]);
  return exitCode === 0 ? output.trim() : '';
}

export async function recognizerCommit(): Promise<string> {
  const commit = (await git(['rev-parse', '--short=12', 'HEAD'])) || 'unknown';
  const changed = await git(['status', '--porcelain', '--', recognizerSources]);
  return changed ? `${commit} with uncommitted recognizer changes` : commit;
}

export async function evidenceVersion(): Promise<string | null> {
  if (!existsSync(evidenceFile)) {
    return null;
  }
  const expected = (await Bun.file(evidenceFile).json()) as { recordedWith?: { gallery?: { version?: string } } };
  return expected.recordedWith?.gallery?.version ?? null;
}

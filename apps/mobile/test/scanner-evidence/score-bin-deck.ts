import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { scoreBinDeck, testDeckCards } from './bin-deck';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { device: { type: 'string' }, ios: { type: 'string' } },
});
const [metroLogPath, runName] = positionals;
if (!metroLogPath || !runName || !values.device || !values.ios) {
  console.error('usage: bun run bin-deck:score <metro-log> <run> --device <model> --ios <version>');
  process.exit(2);
}

const evidence = path.join('test', 'scanner-evidence', 'bin-deck');
const deck = testDeckCards(await readFile(path.join(evidence, 'test-deck.tsv'), 'utf8'));
const run = scoreBinDeck(deck, await readFile(metroLogPath, 'utf8'));
const failed = run.gates.filter((gate) => !gate.passed);
const outcome = failed.length === 0 ? 'bin check passed' : `bin check failed: ${failed.map((gate) => gate.name).join(', ')}`;
const results = {
  RUN_STARTED_AT: run.startedAt === null ? '' : new Date(run.startedAt).toISOString(),
  APP_COMMIT: execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim(),
  DEVICE_MODEL: values.device,
  IOS_VERSION: values.ios,
  DEVICE_PARITY: run.parity ? JSON.stringify(run.parity) : '',
  BATCH_1_SUMMARY: JSON.stringify(run.summary),
  RUN_OUTCOME: outcome,
};

const folder = path.join(evidence, runName);
await mkdir(folder, { recursive: true });
await writeFile(
  path.join(folder, 'results.env'),
  Object.entries(results)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n') + '\n',
);
await writeFile(path.join(folder, 'bin-batch-summaries.ndjson'), `${JSON.stringify(run.summary)}\n`);
await writeFile(
  path.join(folder, 'batch-1-detail.ndjson'),
  [...run.cards, ...run.others].map((row) => JSON.stringify(row)).join('\n') + '\n',
);
await writeFile(
  path.join(folder, 'summary.md'),
  [
    `# Bin-deck run ${runName}`,
    '',
    `Outcome: ${outcome}`,
    '',
    '| Key | Value |',
    '| --- | --- |',
    ...Object.entries(results).map(([key, value]) => `| \`${key}\` | ${value} |`),
    '',
    '| Gate | Result | Value |',
    '| --- | --- | --- |',
    ...run.gates.map((gate) => `| ${gate.name} | ${gate.passed ? 'pass' : 'fail'} | ${gate.value} |`),
    '',
    'Files: `results.env`, `bin-batch-summaries.ndjson`, and `batch-1-detail.ndjson` in this folder. The Metro log is not kept.',
    '',
  ].join('\n'),
);

for (const gate of run.gates) {
  console.log(`${gate.passed ? 'pass' : 'FAIL'}  ${gate.name}: ${gate.value}`);
}
console.log(`Wrote ${folder}.`);
process.exit(failed.length === 0 ? 0 : 1);

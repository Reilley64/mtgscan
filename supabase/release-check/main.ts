import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { importClientFromEnvironment } from '../import/import-client';
import { runReleaseCheck } from './release-check';
import { renderReport } from './report';
import { readSearchCorpus, searchCorpusDirectory } from './search-corpus';

const usage = 'Usage: bun release-check/main.ts [--corpus <directory>] [--report <path>] [--ungraded <path>]';

let values;
try {
  ({ values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      corpus: { type: 'string', default: searchCorpusDirectory },
      report: { type: 'string' },
      ungraded: { type: 'string', default: join(searchCorpusDirectory, 'ungraded-cards.jsonl') },
    },
  }));
} catch {
  console.error(usage);
  process.exit(2);
}

const client = importClientFromEnvironment();

try {
  const report = await runReleaseCheck(client, await readSearchCorpus(values.corpus));
  await Bun.write(values.ungraded, report.ungraded.map((card) => JSON.stringify(card)).join('\n'));
  const markdown = renderReport(report, values.ungraded);
  if (values.report) {
    await Bun.write(values.report, markdown);
  }
  console.log(markdown);
  process.exit(report.passed ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
}

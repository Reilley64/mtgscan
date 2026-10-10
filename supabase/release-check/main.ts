import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { importClientFromEnvironment } from '../import/import-client';
import { catalogSearch, edgeFunctionTextEmbedder, runReleaseCheck, vectorSearch, type SearchMode } from './release-check';
import { renderReport } from './report';
import { readSearchCorpus, searchCorpusDirectory } from './search-corpus';

const usage =
  'Usage: bun release-check/main.ts [--corpus <directory>] [--report <path>] [--ungraded <path>] [--mode baseline|vector]...';

let values;
try {
  ({ values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      corpus: { type: 'string', default: searchCorpusDirectory },
      report: { type: 'string' },
      ungraded: { type: 'string', default: join(searchCorpusDirectory, 'ungraded-cards.jsonl') },
      mode: { type: 'string', multiple: true, default: ['baseline'] },
    },
  }));
} catch {
  console.error(usage);
  process.exit(2);
}

const client = importClientFromEnvironment();
const searchModes: Record<string, () => SearchMode> = {
  baseline: () => catalogSearch(client),
  vector: () => vectorSearch(client, edgeFunctionTextEmbedder(client)),
};
const unknownModes = values.mode.filter((mode) => !(mode in searchModes));
if (unknownModes.length > 0) {
  console.error(usage);
  process.exit(2);
}

try {
  const report = await runReleaseCheck(
    client,
    await readSearchCorpus(values.corpus),
    values.mode.map((mode) => searchModes[mode]!()),
  );
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

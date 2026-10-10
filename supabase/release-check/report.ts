import {
  classScore,
  gatedClasses,
  recallGate,
  vectorTriggerRecall,
  type ModeReport,
  type ReleaseCheckReport,
} from './release-check';

const abandonedSearchesLine = 'Abandoned app searches: not recorded yet (#72).';

function recall(value: number | null): string {
  return value === null ? 'no searches' : value.toFixed(3);
}

function row(cells: (string | number)[]): string {
  return `| ${cells.join(' | ')} |`;
}

function table(header: string[], rows: (string | number)[][]): string[] {
  return [row(header), row(header.map(() => '---')), ...rows.map(row)];
}

function verdict(passed: boolean): string {
  return passed ? 'pass' : 'fail';
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function gateRows(modes: ModeReport[]): (string | number)[][] {
  return [
    [
      'Exact-name top-1, class 1',
      '100%',
      ...modes.map(({ exactNames }) => `${exactNames.rankedFirst} of ${exactNames.searches}`),
    ],
    ...gatedClasses.map((searchClass) => [
      `Capped recall@20, class ${searchClass}`,
      `${recallGate} or more`,
      ...modes.map((mode) => recall(classScore(mode.classes, searchClass).cappedRecall)),
    ]),
    ['Chip violations', '0', ...modes.map((mode) => mode.chipViolations.length)],
    ['Result', '', ...modes.map((mode) => verdict(mode.passed))],
  ];
}

function classRows(modes: ModeReport[]): (string | number)[][] {
  return modes[0]!.classes.map(({ class: searchClass, searches }) => [
    searchClass,
    searches,
    ...modes.flatMap((mode) => [
      recall(classScore(mode.classes, searchClass).cappedRecall),
      recall(classScore(mode.classes, searchClass).uncappedRecall),
    ]),
  ]);
}

function searchRows(modes: ModeReport[]): (string | number)[][] {
  return modes[0]!.searches.map(({ search, class: searchClass, relevant }) => [
    search,
    searchClass,
    relevant,
    ...modes.flatMap((mode) => {
      const score = mode.searches.find((modeScore) => modeScore.search === search)!;
      return [score.found, score.cappedRecall.toFixed(2), score.uncappedRecall.toFixed(2)];
    }),
  ]);
}

function modeHeader(modes: ModeReport[], ...columns: string[]): string[] {
  return modes.flatMap((mode) => columns.map((column) => (modes.length === 1 ? column : `${column}, ${mode.mode}`)));
}

export function renderReport(report: ReleaseCheckReport, ungradedPath: string): string {
  const { modes } = report;
  const names = modes.map((mode) => mode.mode);
  const lines = [
    '# Search release check',
    '',
    `Result: ${verdict(report.passed)}.`,
    '',
    `Rules data as of ${report.rulesDataAsOf ?? 'unknown'}.`,
    '',
    '## Release gate',
    '',
    ...table(['Check', 'Target', ...names], gateRows(modes)),
    '',
    '## Recall@20 by class',
    '',
    'Capped recall@20 divides the relevant cards in the top 20 by the smaller of 20 and the number of relevant cards. Uncapped recall@20 divides by all relevant cards, as in #15.',
    '',
    ...table(['Class', 'Searches', ...modeHeader(modes, 'Capped', 'Uncapped')], classRows(modes)),
    '',
    '## Vector trigger',
    '',
    ...modes.map(
      (mode) =>
        `- ${mode.mode}: class 5 capped recall@20 is ${recall(classScore(mode.classes, 5).cappedRecall)}. The trigger (below ${vectorTriggerRecall}) ${mode.vectorTrigger ? 'fired' : 'did not fire'}.`,
    ),
    `- ${abandonedSearchesLine}`,
    '',
    '## Latency and size',
    '',
    ...table(['Measure', ...names], [['Server p95 latency', ...modes.map((mode) => `${Math.round(mode.p95LatencyMs)} ms`)]]),
    '',
    `Database size: ${megabytes(report.databaseBytes)}.`,
    '',
  ];
  for (const mode of modes) {
    if (mode.exactNames.misses.length > 0) {
      lines.push(
        `## Exact-name misses, ${mode.mode}`,
        '',
        ...table(
          ['Search', 'First result'],
          mode.exactNames.misses.map((miss) => [miss.search, miss.firstResult ?? 'no results']),
        ),
        '',
      );
    }
    if (mode.chipViolations.length > 0) {
      lines.push(
        `## Chip violations, ${mode.mode}`,
        '',
        ...table(
          ['Search', 'Card', 'Failed chips'],
          mode.chipViolations.map((violation) => [violation.search, violation.card, violation.fields.join(', ')]),
        ),
        '',
      );
    }
  }
  lines.push(
    '## Pooled cards with no grade',
    '',
    `${report.ungraded.length} cards in ${new Set(report.ungraded.map((card) => card.search)).size} searches have no grade. They are in \`${ungradedPath}\`.`,
    '',
    '<details>',
    '<summary>Recall@20 by search</summary>',
    '',
    ...table(['Search', 'Class', 'Relevant', ...modeHeader(modes, 'Found', 'Capped', 'Uncapped')], searchRows(modes)),
    '',
    '</details>',
    '',
  );
  return lines.join('\n');
}

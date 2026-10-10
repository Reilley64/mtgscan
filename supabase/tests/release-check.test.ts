import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import { catalogSearch, classScore, runReleaseCheck, vectorSearch, type SearchMode } from '../release-check/release-check';
import { renderReport } from '../release-check/report';
import { readSearchCorpus } from '../release-check/search-corpus';
import { type CatalogQuery, type CatalogRow, type SearchPage } from '../search';
import {
  catalogFixtureManifest,
  oracleIdOf,
  resetCardCatalog,
  runCardEmbeddingImport,
  runCatalogImport,
  runOracleTagImport,
  runPriceImport,
  runReleaseCheckCommand,
} from './catalog-import-command';
import { wordCountEmbedding } from './fake-text-embedder';
import { secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(120_000);

const releaseCheckClient = secretKeyClient();
const baseline = catalogSearch(releaseCheckClient);

type TestSearch = { id: string; class: number; query: CatalogQuery; grades: Record<string, 0 | 1 | 2> };

let alice: TestUser;
let creaturesByName: CatalogRow[];
let rhysticStudyEmbedding: number[];

async function catalogPage(client: TestUser['client'], query: CatalogQuery) {
  const { data, error } = await client.rpc('search_catalog', { query: query as Json });
  expect(error).toBeNull();
  return data as unknown as SearchPage<CatalogRow>;
}

async function allCreaturesByName(): Promise<CatalogRow[]> {
  const rows: CatalogRow[] = [];
  let cursor: string | null = null;
  do {
    const page = await catalogPage(alice.client, { types: ['creature'], limit: 50, cursor });
    rows.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return rows;
}

async function writeCorpus(searches: TestSearch[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mtgscan-release-check-'));
  const gradeLines = [];
  for (const search of searches) {
    for (const [card, grade] of Object.entries(search.grades)) {
      const oracleId = creaturesByName.find((row) => row.name === card)?.oracle_id ?? (await oracleIdOf(card));
      gradeLines.push({ search: search.id, oracle_id: oracleId, card, grade });
    }
  }
  await Bun.write(
    join(directory, 'search-corpus.jsonl'),
    searches
      .map(({ id, class: searchClass, query }) =>
        JSON.stringify({ id, class: searchClass, intent: `Find ${id}.`, query, reference_query: id }),
      )
      .join('\n'),
  );
  await Bun.write(join(directory, 'search-grades.jsonl'), gradeLines.map((line) => JSON.stringify(line)).join('\n'));
  return directory;
}

async function checkCorpus(searches: TestSearch[], modes?: SearchMode[]) {
  return runReleaseCheck(releaseCheckClient, await readSearchCorpus(await writeCorpus(searches)), modes);
}

const sweepers = ['Calamity of Cinders', 'Everything Comes to Dust', 'Serene Heart', 'Specter of Mortality', 'Waterspout Elemental'];

function grade(cards: string[], value: 0 | 1 | 2): Record<string, 0 | 1 | 2> {
  return Object.fromEntries(cards.map((card) => [card, value]));
}

function passingSearches(): TestSearch[] {
  const creatureNames = creaturesByName.map((row) => row.name);
  return [
    { id: 'fog', class: 1, query: { text: 'fog' }, grades: { Fog: 2 } },
    { id: 'sweepers', class: 2, query: { tags: ['sweeper'] }, grades: grade(sweepers, 2) },
    {
      id: 'creatures',
      class: 2,
      query: { types: ['creature'] },
      grades: { ...grade(creatureNames.slice(0, 20), 2), ...grade(creatureNames.slice(-5), 1) },
    },
    { id: 'fog-names', class: 3, query: { names: ['fog'] }, grades: { Fog: 2, 'Fog Bank': 1 } },
    {
      id: 'cheap-green-creatures',
      class: 4,
      query: { types: ['creature'], colors: ['G'], mana_value_max: 1 },
      grades: { 'Llanowar Elves': 2 },
    },
    { id: 'cards-like-rhystic-study', class: 5, query: { text: 'cards like rhystic study' }, grades: { 'Rhystic Study': 2 } },
  ];
}

function withoutField(field: keyof CatalogQuery): SearchMode {
  return {
    name: `without ${field}`,
    search: (query) => baseline.search(Object.fromEntries(Object.entries(query).filter(([key]) => key !== field))),
  };
}

beforeAll(async () => {
  alice = await signUpNewUser();
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runOracleTagImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
  const { data, error } = await releaseCheckClient.rpc('list_card_embedding_texts', {});
  expect(error).toBeNull();
  const rhysticStudy = await oracleIdOf('Rhystic Study');
  rhysticStudyEmbedding = wordCountEmbedding(data!.find((card) => card.oracle_id === rhysticStudy)!.embedding_text);
  await runCardEmbeddingImport(async (text) => wordCountEmbedding(text));
  creaturesByName = await allCreaturesByName();
});

describe('release check access', () => {
  test('a catalog search with the secret key is recorded as a release check search with no user', async () => {
    const page = await baseline.search({ text: 'fog' });

    const { data, error } = await releaseCheckClient
      .from('search_telemetry')
      .select('user_id, caller, api')
      .eq('search_id', page.search_id)
      .single();

    expect(error).toBeNull();
    expect(data).toEqual({ user_id: null, caller: 'release_check', api: 'catalog' });
  });

  test('a signed-in user\'s catalog search is still recorded as an app search', async () => {
    const page = await catalogPage(alice.client, { text: 'fog' });

    const { data } = await releaseCheckClient
      .from('search_telemetry')
      .select('user_id, caller')
      .eq('search_id', page.search_id)
      .single();

    expect(data).toEqual({ user_id: alice.userId, caller: 'app' });
  });

  test.each([
    ['get_cards', { oracle_ids: ['6ad8011d-3471-4369-9d68-b264cc027487'] }],
    ['list_card_printings', { oracle_id: '6ad8011d-3471-4369-9d68-b264cc027487' }],
    ['search_oracle_tags', { text: 'removal' }],
  ] as const)('the secret key is refused by %s', async (fn, query) => {
    const { data, error } = await releaseCheckClient.rpc(fn, { query: query as Json });

    expect(data).toBeNull();
    expect(error?.code).toBe('42501');
  });
});

describe('release check metrics', () => {
  test('a corpus that meets every gate passes and reports exact-name top-1 and capped and uncapped recall@20 per class', async () => {
    const report = await checkCorpus(passingSearches());
    const [mode] = report.modes;

    expect(report.passed).toBe(true);
    expect(mode!.exactNames).toEqual({ rankedFirst: 1, searches: 1, misses: [] });
    expect(mode!.classes).toEqual([
      { class: 1, searches: 1, cappedRecall: 1, uncappedRecall: 1 },
      { class: 2, searches: 2, cappedRecall: 1, uncappedRecall: 0.9 },
      { class: 3, searches: 1, cappedRecall: 1, uncappedRecall: 1 },
      { class: 4, searches: 1, cappedRecall: 1, uncappedRecall: 1 },
      { class: 5, searches: 1, cappedRecall: 0, uncappedRecall: 0 },
    ]);
    expect(mode!.chipViolations).toEqual([]);
  });

  test('class 5 capped recall@20 below 0.5 fires the vector trigger, and 0.5 does not', async () => {
    const halfFound: TestSearch = {
      id: 'fog-or-rhystic-study',
      class: 5,
      query: { names: ['fog'] },
      grades: { Fog: 2, 'Rhystic Study': 2 },
    };
    const otherClasses = passingSearches().filter((search) => search.class !== 5);
    const [below] = (await checkCorpus([...passingSearches(), halfFound])).modes;
    const [atHalf] = (await checkCorpus([...otherClasses, halfFound])).modes;

    expect(below!.classes.find((score) => score.class === 5)!.cappedRecall).toBe(0.25);
    expect(below!.vectorTrigger).toBe(true);
    expect(atHalf!.classes.find((score) => score.class === 5)!.cappedRecall).toBe(0.5);
    expect(atHalf!.vectorTrigger).toBe(false);
  });

  test('an exact-name search whose card is not first fails the release check', async () => {
    const report = await checkCorpus(
      passingSearches().map((search) =>
        search.id === 'fog' ? { ...search, grades: { Fog: 0, 'Fog Bank': 2 } } : search,
      ),
    );

    expect(report.passed).toBe(false);
    expect(report.modes[0]!.exactNames).toEqual({ rankedFirst: 0, searches: 1, misses: [{ search: 'fog', firstResult: 'Fog' }] });
  });

  test.each([2, 3, 4])('class %i below 0.7 capped recall@20 fails the release check', async (searchClass) => {
    const report = await checkCorpus([
      ...passingSearches(),
      { id: 'missed', class: searchClass, query: { names: ['fog'] }, grades: grade(sweepers, 2) },
    ]);

    expect(report.passed).toBe(false);
    expect(report.modes[0]!.classes.find((score) => score.class === searchClass)!.cappedRecall).toBeLessThan(0.7);
  });

  test('pooled cards in the top 20 with no grade are listed', async () => {
    const report = await checkCorpus(passingSearches());

    expect(report.ungraded).toContainEqual({
      search: 'fog',
      oracle_id: await oracleIdOf('Fog Bank'),
      card: 'Fog Bank',
      grade: null,
    });
    expect(report.ungraded.map((card) => card.card)).not.toContain('Fog');
  });

  test('the report has server p95 latency from release check telemetry and the database size', async () => {
    const report = await checkCorpus(passingSearches());

    expect(report.modes[0]!.p95LatencyMs).toBeGreaterThan(0);
    expect(report.databaseBytes).toBeGreaterThan(1_000_000);
  });

  test('a second search mode is reported beside the baseline for every class', async () => {
    const report = await checkCorpus(passingSearches(), [baseline, withoutField('mana_value_max')]);

    expect(report.modes.map((mode) => mode.mode)).toEqual(['baseline', 'without mana_value_max']);
    expect(report.modes.map((mode) => mode.classes.length)).toEqual([5, 5]);
    expect(report.modes.map((mode) => mode.passed)).toEqual([true, false]);
    expect(report.passed).toBe(false);
  });
});

describe('vector mode', () => {
  const towardRhysticStudy = () => vectorSearch(releaseCheckClient, async () => rhysticStudyEmbedding);

  test('the vector mode sends the embedding of each search text with the search', async () => {
    const [, vector] = (await checkCorpus(passingSearches(), [baseline, towardRhysticStudy()])).modes;

    expect(vector!.mode).toBe('vector');
    expect(classScore(vector!.classes, 5).cappedRecall).toBe(1);
    expect(vector!.p95TextEmbeddingMs).toBeGreaterThanOrEqual(0);
  });

  test('the vector gate passes when class 5 rises by 0.15 or more and no other class drops by more than 0.02', async () => {
    const report = await checkCorpus(passingSearches(), [baseline, towardRhysticStudy()]);

    expect(report.vectorGate).toMatchObject({
      classFiveRise: 1,
      largestDrop: { drop: 0 },
      chipViolations: 0,
      databaseBytes: report.databaseBytes,
      passed: true,
    });
    expect(renderReport(report, 'ungraded.jsonl')).toContain('## Vector gate');
  });

  test('the vector gate fails when another class drops by more than 0.02', async () => {
    const vector = towardRhysticStudy();
    const missesFilterSearches: SearchMode = {
      name: 'vector',
      search: (query) => (query.text ? vector.search(query) : baseline.search({ names: ['fog'] })),
    };

    const report = await checkCorpus(passingSearches(), [baseline, missesFilterSearches]);

    expect(report.vectorGate!.classFiveRise).toBe(1);
    expect(report.vectorGate!.largestDrop.drop).toBeGreaterThan(0.02);
    expect(report.vectorGate!.passed).toBe(false);
  });

  test('the vector gate fails when class 5 does not rise by 0.15', async () => {
    const awayFromRhysticStudy = vectorSearch(releaseCheckClient, async () => rhysticStudyEmbedding.map((value) => -value));

    const report = await checkCorpus(passingSearches(), [baseline, awayFromRhysticStudy]);

    expect(report.vectorGate!.classFiveRise).toBeLessThan(0.15);
    expect(report.vectorGate!.passed).toBe(false);
  });

  test('a report with only the baseline has no vector gate', async () => {
    const report = await checkCorpus(passingSearches());

    expect(report.vectorGate).toBeNull();
    expect(renderReport(report, 'ungraded.jsonl')).not.toContain('## Vector gate');
  });
});

describe('chip violations', () => {
  test.each([
    ['names', { types: ['instant'], names: ['fog'] }],
    ['names_exclude', { types: ['instant'], names_exclude: ['fire'] }],
    ['types', { colors: ['G'], types: ['instant'] }],
    ['types_exclude', { colors: ['G'], types_exclude: ['creature'] }],
    ['colors', { types: ['instant'], colors: ['G'] }],
    ['colors_exclude', { types: ['instant'], colors_exclude: ['U'] }],
    ['identity_subset_of', { types: ['instant'], identity_subset_of: ['G'] }],
    ['mana_value_min', { types: ['instant'], mana_value_min: 3 }],
    ['mana_value_max', { types: ['creature'], mana_value_max: 2 }],
    ['power_min', { types: ['creature'], power_min: 5 }],
    ['power_max', { types: ['creature'], power_max: 1 }],
    ['toughness_min', { types: ['creature'], toughness_min: 5 }],
    ['toughness_max', { types: ['creature'], toughness_max: 1 }],
    ['price_min', { types: ['instant'], price_min: '0.50' }],
    ['price_max', { types: ['instant'], price_max: '0.20' }],
    ['keywords', { types: ['creature'], keywords: ['flying'] }],
    ['keywords_exclude', { types: ['creature'], keywords_exclude: ['flying'] }],
    ['sets', { types: ['instant'], sets: ['msc'] }],
    ['sets_exclude', { types: ['instant'], sets_exclude: ['msc'] }],
    ['rarities', { types: ['instant'], rarities: ['common'] }],
    ['rarities_exclude', { types: ['instant'], rarities_exclude: ['common'] }],
    ['tags', { colors: ['G'], tags: ['sweeper'] }],
    ['tags_exclude', { tags: ['removal'], tags_exclude: ['sweeper'] }],
    ['is_commander', { types: ['creature'], is_commander: true }],
    ['is_game_changer', { types: ['enchantment'], is_game_changer: true }],
  ] as [keyof CatalogQuery, CatalogQuery][])(
    'a returned card that fails the %s chip is a chip violation, and catalog search returns none',
    async (field, query) => {
      const searches = [{ id: 'chip', class: 4, query, grades: {} }];
      const [kept, ignored] = (await checkCorpus(searches, [baseline, withoutField(field)])).modes;

      expect(kept!.chipViolations).toEqual([]);
      expect(ignored!.chipViolations.length).toBeGreaterThan(0);
      expect(ignored!.chipViolations.every((violation) => violation.fields.includes(field))).toBe(true);
      expect(ignored!.passed).toBe(false);
    },
  );
});

describe('release check command', () => {
  async function runCommand(searches: TestSearch[]) {
    const directory = await writeCorpus(searches);
    const result = await runReleaseCheckCommand(
      '--corpus',
      directory,
      '--report',
      join(directory, 'report.md'),
      '--ungraded',
      join(directory, 'ungraded.jsonl'),
    );
    return { ...result, directory };
  }

  test('a passing corpus exits with success and writes the report and the pooled cards with no grade', async () => {
    const { exitCode, output, directory } = await runCommand(passingSearches());
    const report = await Bun.file(join(directory, 'report.md')).text();
    const ungraded = (await Bun.file(join(directory, 'ungraded.jsonl')).text()).split('\n').map((line) => JSON.parse(line));

    expect(exitCode).toBe(0);
    expect(output).toContain(report);
    expect(report).toContain('Result: pass.');
    expect(report).toContain('Abandoned app searches: not recorded yet (#72).');
    expect(report).toContain('Server p95 latency');
    expect(report).toContain('Database size:');
    expect(ungraded).toContainEqual({ search: 'fog', oracle_id: await oracleIdOf('Fog Bank'), card: 'Fog Bank', grade: null });
  });

  test('a failing corpus exits with a failure', async () => {
    const { exitCode, directory } = await runCommand(
      passingSearches().map((search) =>
        search.id === 'fog' ? { ...search, grades: { Fog: 0, 'Fog Bank': 2 } } : search,
      ),
    );

    expect(exitCode).toBe(1);
    expect(await Bun.file(join(directory, 'report.md')).text()).toContain('Result: fail.');
  });
});


import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { readSearchCorpus, searchClasses, searchCorpusDirectory } from '../release-check/search-corpus';
import type { Json } from '../database.types';
import { readSearchError } from '../search';
import {
  catalogFixtureManifest,
  resetCardCatalog,
  runCatalogImport,
  runOracleTagImport,
} from './catalog-import-command';
import { signUpNewUser } from './local-stack';

setDefaultTimeout(60_000);

const corpus = await readSearchCorpus();

async function corpusWithGrades(gradeLines: object[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'mtgscan-search-corpus-'));
  await Bun.write(
    join(directory, 'search-corpus.jsonl'),
    Bun.file(join(searchCorpusDirectory, 'search-corpus.jsonl')),
  );
  await Bun.write(
    join(directory, 'search-grades.jsonl'),
    gradeLines.map((line) => JSON.stringify(line)).join('\n'),
  );
  return directory;
}

const solRing = { search: 'sol-ring', oracle_id: '6ad8011d-3471-4369-9d68-b264cc027487', card: 'Sol Ring' };

describe('search corpus', () => {
  test('the corpus holds at least 80 searches and at least 15 in each search class', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(80);
    for (const searchClass of searchClasses) {
      expect(corpus.filter((search) => search.class === searchClass).length).toBeGreaterThanOrEqual(15);
    }
  });

  test('every class 1 search grades exactly one card as exactly what was asked', () => {
    for (const search of corpus.filter((corpusSearch) => corpusSearch.class === 1)) {
      expect({ search: search.id, exact: [...search.grades.values()].filter((grade) => grade === 2).length }).toEqual({
        search: search.id,
        exact: 1,
      });
    }
  });

  test('every search grades at least one card as relevant', () => {
    for (const search of corpus) {
      expect({ search: search.id, relevant: [...search.grades.values()].some((grade) => grade > 0) }).toEqual({
        search: search.id,
        relevant: true,
      });
    }
  });

  test('a grade outside 0 to 2 is refused with its line', async () => {
    const directory = await corpusWithGrades([{ ...solRing, grade: 2 }, { ...solRing, grade: 3 }]);
    await expect(readSearchCorpus(directory)).rejects.toThrow('search-grades.jsonl:2: grade must be 0, 1, or 2.');
  });

  test('a grade for a search that is not in the corpus is refused', async () => {
    const directory = await corpusWithGrades([{ ...solRing, search: 'sol-rings', grade: 2 }]);
    await expect(readSearchCorpus(directory)).rejects.toThrow('search sol-rings is not in the corpus.');
  });

  test('a second grade for the same card in one search is refused', async () => {
    const directory = await corpusWithGrades([{ ...solRing, grade: 2 }, { ...solRing, grade: 0 }]);
    await expect(readSearchCorpus(directory)).rejects.toThrow('Sol Ring already has a grade for sol-ring.');
  });
});

describe('search corpus queries', () => {
  beforeAll(async () => {
    await resetCardCatalog();
    expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
    expect((await runOracleTagImport(catalogFixtureManifest)).exitCode).toBe(0);
  });

  test('every corpus query passes the search query validator', async () => {
    const { client } = await signUpNewUser();
    for (const search of corpus) {
      const { error } = await client.rpc('search_catalog', { query: search.query as Json });
      expect({ search: search.id, error: error && readSearchError(error) }).toEqual({ search: search.id, error: null });
    }
  });
});

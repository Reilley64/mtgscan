import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import { readSearchError, type CatalogQuery, type CatalogRow, type SearchPage } from '../search';
import {
  catalogFixtureManifest,
  oracleIdOf,
  resetCardCatalog,
  runCardEmbeddingImport,
  runCatalogImport,
  runOracleTagImport,
} from './catalog-import-command';
import { wordCountEmbedding } from './fake-text-embedder';
import { secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const unmatchedText = 'qqxv zzkw';

let alice: TestUser;
const cardEmbeddings = new Map<string, number[]>();

async function search(query: CatalogQuery, textEmbedding?: unknown) {
  const { data, error } = await alice.client.rpc('search_catalog', {
    query: query as Json,
    text_embedding: textEmbedding as Json,
  });
  return { page: data as SearchPage<CatalogRow> | null, error: error && readSearchError(error) };
}

async function page(query: CatalogQuery, textEmbedding?: number[]) {
  const { page, error } = await search(query, textEmbedding);
  expect(error).toBeNull();
  return page!;
}

async function names(query: CatalogQuery, textEmbedding?: number[]) {
  return (await page(query, textEmbedding)).items.map((row) => row.name);
}

async function embeddingOf(name: string) {
  return cardEmbeddings.get(await oracleIdOf(name))!;
}

beforeAll(async () => {
  alice = await signUpNewUser();
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runOracleTagImport(catalogFixtureManifest)).exitCode).toBe(0);
  const { data, error } = await secretKeyClient().rpc('list_card_embedding_texts', {});
  expect(error).toBeNull();
  for (const card of data!) {
    cardEmbeddings.set(card.oracle_id, wordCountEmbedding(card.embedding_text));
  }
  await runCardEmbeddingImport(async (text) => wordCountEmbedding(text));
});

describe('catalog search with a text embedding', () => {
  test('adds the cards nearest to the text embedding when no card matches the text', async () => {
    expect(await names({ text: unmatchedText })).toEqual([]);

    expect((await names({ text: unmatchedText }, await embeddingOf('Llanowar Elves')))[0]).toBe('Llanowar Elves');
  });

  test('keeps every chip exact for the cards it adds', async () => {
    const items = (await page({ text: unmatchedText, identity_subset_of: ['U'] }, await embeddingOf('Llanowar Elves'))).items;

    expect(items.length).toBeGreaterThan(0);
    expect(items.map((row) => row.name)).not.toContain('Llanowar Elves');
    expect(items.every((row) => row.color_identity.every((color) => color === 'U'))).toBe(true);
  });

  test('adds only Commander-legal cards', async () => {
    const found = await names({ text: unmatchedText, limit: 50 }, await embeddingOf('Primeval Titan'));

    expect(found.length).toBeGreaterThan(0);
    expect(found).not.toContain('Primeval Titan');
  });

  test('keeps an exact card name first', async () => {
    const found = await names({ text: 'fog' }, await embeddingOf('Fog Bank'));

    expect(found.slice(0, 2)).toEqual(['Fog', 'Fog Bank']);
  });

  test('ranks a card nearest to the text embedding with the text matches', async () => {
    expect((await names({ text: 'fog' }, await embeddingOf('Llanowar Elves'))).slice(0, 3)).toContain('Llanowar Elves');
  });

  test('moves a card that matches the text and is nearest to the text embedding up past other text matches', async () => {
    const textMatches = await names({ text: 'creature', limit: 50 });
    const lastTextMatch = textMatches.at(-1)!;

    const found = await names({ text: 'creature', limit: 50 }, await embeddingOf(lastTextMatch));

    expect(textMatches).toHaveLength(50);
    expect(found.indexOf(lastTextMatch)).toBeLessThan(textMatches.indexOf(lastTextMatch) - 20);
  });

  test('pages cover every result once', async () => {
    const embedding = await embeddingOf('Counterspell');
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const next: SearchPage<CatalogRow> = await page({ text: 'counter', limit: 20, cursor }, embedding);
      seen.push(...next.items.map((row) => row.oracle_id));
      cursor = next.next_cursor;
    } while (cursor);

    expect(seen.length).toBeGreaterThan(20);
    expect(new Set(seen).size).toBe(seen.length);
  });

  test('a cursor from a search with a text embedding fails without it', async () => {
    const first = await page({ text: unmatchedText, limit: 5 }, await embeddingOf('Counterspell'));

    const { error } = await search({ text: unmatchedText, limit: 5, cursor: first.next_cursor });

    expect(error?.code).toBe('invalid_cursor');
  });

  test('has no effect on a search sorted by name', async () => {
    expect(await names({ text: 'counter', sort: 'name' }, await embeddingOf('Llanowar Elves'))).toEqual(
      await names({ text: 'counter', sort: 'name' }),
    );
  });

  test.each([
    ['a list of the wrong size', new Array(383).fill(0)],
    ['a value above 1', [2, ...new Array(383).fill(0)]],
    ['a value that is not a number', ['0', ...new Array(383).fill(0)]],
    ['an object', { embedding: [] }],
  ])('a text embedding that is %s is refused on text_embedding', async (_, textEmbedding) => {
    const { page, error } = await search({ text: 'fog' }, textEmbedding);

    expect(page).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field: 'text_embedding' });
  });

  test('a text embedding without text is refused on text_embedding', async () => {
    const { error } = await search({ types: ['creature'] }, await embeddingOf('Fog'));

    expect(error).toMatchObject({ code: 'invalid_argument', field: 'text_embedding' });
  });
});

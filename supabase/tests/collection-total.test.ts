import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CollectionTotal, CollectionTotalQuery } from '../collection';
import type { Json } from '../database.types';
import { readSearchError } from '../search';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const tableNotFound = 'PGRST205';
const functionNotFound = 'PGRST202';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const secretLairNonfoilOnly = '018830b2-dff9-45f3-9cc2-dc5b2eec0e54';
const secretLairWithNoPrice = '0cd83c0e-8e37-40bf-87a5-5b4c009248fb';

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function readCollectionTotal(client: AppClient, query: CollectionTotalQuery | Record<string, unknown> | unknown[] = {}) {
  const { data, error } = await client.rpc('get_collection_total', { query: query as Json });
  return { total: data as unknown as CollectionTotal | null, error: error && readSearchError(error) };
}

async function collectionTotal(user: TestUser, query: CollectionTotalQuery = {}) {
  const { total, error } = await readCollectionTotal(user.client, query);
  expect(error).toBeNull();
  return total!;
}

describe('the collection total read', () => {
  test('a user with no collection entries has a total of 0 with no copies', async () => {
    const user = await signUpNewUser();

    expect(await collectionTotal(user)).toEqual({
      total: '0.00',
      currency: 'USD',
      priced_copies: 0,
      copies: 0,
    });
  });

  test("the total sums every copy's current USD price for its card printing and finish, whatever its condition and language", async () => {
    const user = await signUpNewUser();
    await committed(
      user,
      scanBatch([
        stack(angelicCurator, { copies: 2 }),
        stack(angelicCurator, { finish: 'foil', condition: 'damaged', language: 'ja' }),
        stack(angelicCurator, { finish: 'etched', condition: 'moderately_played', language: 'de' }),
      ]),
    );

    expect(await collectionTotal(user)).toMatchObject({ total: '1.16', currency: 'USD', priced_copies: 4, copies: 4 });
  });

  test('a copy with no current price is left out of the total and counted in the coverage', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(secretLairNonfoilOnly, { copies: 2 }), stack(secretLairWithNoPrice, { finish: 'foil' })]));

    expect(await collectionTotal(user)).toMatchObject({ total: '8.82', priced_copies: 2, copies: 3 });
  });

  test('in EUR, the total uses EUR prices, and an etched copy has no price', async () => {
    const user = await signUpNewUser();
    await committed(
      user,
      scanBatch([stack(angelicCurator), stack(angelicCurator, { finish: 'foil' }), stack(angelicCurator, { finish: 'etched' })]),
    );

    expect(await collectionTotal(user, { price_currency: 'EUR' })).toMatchObject({
      total: '0.28',
      currency: 'EUR',
      priced_copies: 2,
      copies: 3,
    });
  });

  test.each<[string, Record<string, unknown> | unknown[], string | null]>([
    ['a query that is not an object', [], null],
    ['a price currency other than USD or EUR', { price_currency: 'GBP' }, 'price_currency'],
    ['an unknown field', { limit: 1 }, 'limit'],
  ])('%s is refused with invalid_argument', async (_, query, field) => {
    const user = await signUpNewUser();

    const { total, error } = await readCollectionTotal(user.client, query);

    expect(total).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
  });

  test.each([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot read a collection total', async (_, client) => {
    const { data, error } = await client().rpc('get_collection_total', { query: {} });

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });
});

describe('no price history', () => {
  test('the daily collection totals table no longer exists', async () => {
    const { error } = await secretKeyClient().from('daily_collection_totals' as never).select('*');

    expect(error?.code).toBe(tableNotFound);
  });

  test('the function that recorded daily collection totals no longer exists', async () => {
    const { error } = await secretKeyClient().rpc('record_daily_collection_totals' as never);

    expect(error?.code).toBe(functionNotFound);
  });
});

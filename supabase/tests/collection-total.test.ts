import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CollectionCopyRow, CollectionTotal, CollectionTotalQuery } from '../collection';
import type { Json } from '../database.types';
import { readSearchError, type SearchPage } from '../search';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { daysAgo, storeExchangeRates } from './exchange-rate-seeds';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const tableNotFound = 'PGRST205';
const functionNotFound = 'PGRST202';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const secretLairNonfoilOnly = '018830b2-dff9-45f3-9cc2-dc5b2eec0e54';
const secretLairWithNoPrice = '0cd83c0e-8e37-40bf-87a5-5b4c009248fb';
const kjeldoranHomeGuardWithOnlyEurPrice = '45145931-16e8-4401-9d67-57856ffef0dc';

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
  await storeExchangeRates();
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

  test('a copy of a card printing with only a Scryfall EUR price is left out of the total', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator), stack(kjeldoranHomeGuardWithOnlyEurPrice)]));

    expect(await collectionTotal(user)).toMatchObject({ total: '0.21', priced_copies: 1, copies: 2 });
  });

  test.each<[string, Record<string, unknown> | unknown[], string | null]>([
    ['a query that is not an object', [], null],
    ['a price currency with no exchange rate', { price_currency: 'GBP' }, 'price_currency'],
    ['a price currency that is not a string', { price_currency: 36 }, 'price_currency'],
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

describe('the collection total in another currency', () => {
  async function curatorCollection() {
    const user = await signUpNewUser();
    await committed(
      user,
      scanBatch([
        stack(angelicCurator, { copies: 2 }),
        stack(angelicCurator, { finish: 'foil' }),
        stack(angelicCurator, { finish: 'etched' }),
      ]),
    );
    return user;
  }

  test('the total is the USD total times the exchange rate, rounded to cents, with the exchange rate and its date', async () => {
    const user = await curatorCollection();

    expect(await collectionTotal(user, { price_currency: 'AUD' })).toEqual({
      total: '1.77',
      currency: 'AUD',
      priced_copies: 4,
      copies: 4,
      approximate: true,
      exchange_rate: '1.5234',
      rate_date: daysAgo(0),
    });
  });

  test('a total in JPY rounds to whole yen', async () => {
    const user = await curatorCollection();

    expect(await collectionTotal(user, { price_currency: 'JPY' })).toMatchObject({ total: '176', currency: 'JPY' });
  });

  test('a total in EUR converts the USD total once, so it can differ from the sum of the converted copy prices', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator, { copies: 5 })]));
    const { data, error } = await user.client.rpc('search_collection', { query: { rows: 'copies', price_currency: 'EUR' } });
    expect(error).toBeNull();
    const copyPrices = (data as unknown as SearchPage<CollectionCopyRow>).items.map((row) => row.price?.amount);

    expect(copyPrices).toEqual(['0.20', '0.20', '0.20', '0.20', '0.20']);
    expect(await collectionTotal(user, { price_currency: 'EUR' })).toMatchObject({ total: '0.98', currency: 'EUR' });
  });

  test('a USD total has no approximate flag, exchange rate, or rate date', async () => {
    const user = await curatorCollection();

    expect(await collectionTotal(user, { price_currency: 'USD' })).toEqual({
      total: '1.16',
      currency: 'USD',
      priced_copies: 4,
      copies: 4,
    });
  });

  test('a copy with no USD price is left out of the total in every currency', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator), stack(kjeldoranHomeGuardWithOnlyEurPrice)]));

    expect(await collectionTotal(user, { price_currency: 'AUD' })).toMatchObject({ total: '0.32', priced_copies: 1, copies: 2 });
  });

  test('a currency that left the exchange rates is refused with invalid_argument', async () => {
    const user = await signUpNewUser();
    await storeExchangeRates({ AUD: 1.5234 });

    const { error } = await readCollectionTotal(user.client, { price_currency: 'JPY' });
    await storeExchangeRates();

    expect(error).toMatchObject({ code: 'invalid_argument', field: 'price_currency' });
  });
});

describe('no price history', () => {
  test('a signed-in user finds no daily collection totals table', async () => {
    const user = await signUpNewUser();

    const { error } = await user.client.from('daily_collection_totals' as never).select('*');

    expect(error?.code).toBe(tableNotFound);
  });

  test('a signed-in user finds no function that records daily collection totals', async () => {
    const user = await signUpNewUser();

    const { error } = await user.client.rpc('record_daily_collection_totals' as never);

    expect(error?.code).toBe(functionNotFound);
  });
});

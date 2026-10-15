import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CurrentPrices, CurrentPricesQuery } from '../collection';
import type { Json } from '../database.types';
import { readSearchError } from '../search';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { daysAgo, storeExchangeRates } from './exchange-rate-seeds';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const secretLairNonfoilOnly = '018830b2-dff9-45f3-9cc2-dc5b2eec0e54';
const secretLairWithNoPrice = '0cd83c0e-8e37-40bf-87a5-5b4c009248fb';
const notInTheCardCatalog = '00000000-0000-4000-8000-000000000000';

let user: TestUser;
let pricesObservedAt: string;

beforeAll(async () => {
  user = await signUpNewUser();
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
  await storeExchangeRates();
  const { data, error } = await secretKeyClient().from('import_snapshots').select('snapshot_at').eq('source', 'prices').single();
  expect(error).toBeNull();
  pricesObservedAt = data!.snapshot_at;
});

afterAll(async () => {
  await setPriceSnapshotAt(pricesObservedAt);
  await storeExchangeRates();
});

async function setPriceSnapshotAt(at: string) {
  const { error } = await secretKeyClient().from('import_snapshots').update({ snapshot_at: at }).eq('source', 'prices');
  expect(error).toBeNull();
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

async function readCurrentPrices(client: AppClient, query: CurrentPricesQuery | Record<string, unknown> | unknown[]) {
  const { data, error } = await client.rpc('get_current_prices', { query: query as Json });
  return { prices: data as unknown as CurrentPrices | null, error: error && readSearchError(error) };
}

async function currentPrices(query: CurrentPricesQuery) {
  const { prices, error } = await readCurrentPrices(user.client, query);
  expect(error).toBeNull();
  return prices!.items;
}

describe('the current prices read', () => {
  test('returns the current price of each card printing and finish in the order asked', async () => {
    expect(
      await currentPrices({
        items: [
          { printing_id: angelicCurator, finish: 'etched' },
          { printing_id: secretLairNonfoilOnly, finish: 'nonfoil' },
          { printing_id: angelicCurator, finish: 'nonfoil' },
          { printing_id: angelicCurator, finish: 'foil' },
        ],
      }),
    ).toEqual([
      { printing_id: angelicCurator, finish: 'etched', price: { amount: '0.44', currency: 'USD', finish: 'etched', stale: false } },
      { printing_id: secretLairNonfoilOnly, finish: 'nonfoil', price: { amount: '4.41', currency: 'USD', finish: 'nonfoil', stale: false } },
      { printing_id: angelicCurator, finish: 'nonfoil', price: { amount: '0.21', currency: 'USD', finish: 'nonfoil', stale: false } },
      { printing_id: angelicCurator, finish: 'foil', price: { amount: '0.30', currency: 'USD', finish: 'foil', stale: false } },
    ]);
  });

  test('a card printing and finish with no current price has a null price, never the price of another finish', async () => {
    expect(
      await currentPrices({
        items: [
          { printing_id: secretLairWithNoPrice, finish: 'foil' },
          { printing_id: secretLairNonfoilOnly, finish: 'foil' },
        ],
      }),
    ).toEqual([
      { printing_id: secretLairWithNoPrice, finish: 'foil', price: null },
      { printing_id: secretLairNonfoilOnly, finish: 'foil', price: null },
    ]);
  });

  test('a card printing that is not in the card catalog has a null price', async () => {
    expect(await currentPrices({ items: [{ printing_id: notInTheCardCatalog, finish: 'nonfoil' }] })).toEqual([
      { printing_id: notInTheCardCatalog, finish: 'nonfoil', price: null },
    ]);
  });

  test('100 items are read', async () => {
    const items = Array.from({ length: 100 }, (_, index) => ({
      printing_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
      finish: 'nonfoil' as const,
    }));

    expect(await currentPrices({ items })).toHaveLength(100);
  });

  test.each<[string, Record<string, unknown> | unknown[], string | null]>([
    ['a query that is not an object', [], null],
    ['a query with no items', {}, 'items'],
    ['an empty list of items', { items: [] }, 'items'],
    [
      'more than 100 items',
      {
        items: Array.from({ length: 101 }, (_, index) => ({
          printing_id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          finish: 'nonfoil',
        })),
      },
      'items',
    ],
    ['an unknown field', { items: [{ printing_id: angelicCurator, finish: 'foil' }], limit: 1 }, 'limit'],
    ['an unknown field in an item', { items: [{ printing_id: angelicCurator, finish: 'foil', condition: 'near_mint' }] }, 'items[0].condition'],
    [
      'a bad finish',
      {
        items: [
          { printing_id: angelicCurator, finish: 'nonfoil' },
          { printing_id: angelicCurator, finish: 'foil' },
          { printing_id: angelicCurator, finish: 'etched' },
          { printing_id: secretLairNonfoilOnly, finish: 'shiny' },
        ],
      },
      'items[3].finish',
    ],
    ['an item with no finish', { items: [{ printing_id: angelicCurator }] }, 'items[0].finish'],
    [
      'an item that repeats an earlier item',
      { items: [{ printing_id: angelicCurator, finish: 'foil' }, { printing_id: angelicCurator, finish: 'foil' }] },
      'items[1]',
    ],
    ['a card printing ID that is not a UUID', { items: [{ printing_id: 'mh2-262', finish: 'foil' }] }, 'items[0].printing_id'],
    ['a price currency, even USD, as the app converts prices itself', { items: [{ printing_id: angelicCurator, finish: 'foil' }], price_currency: 'USD' }, 'price_currency'],
  ])('%s is refused with invalid_argument', async (_, query, field) => {
    const { prices, error } = await readCurrentPrices(user.client, query);

    expect(prices).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
  });

  test.each([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot read current prices', async (_, client) => {
    const { data, error } = await client().rpc('get_current_prices', {
      query: { items: [{ printing_id: angelicCurator, finish: 'foil' }] },
    });

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });
});

describe('stale current prices', () => {
  const curatorFoil = { items: [{ printing_id: angelicCurator, finish: 'foil' as const }] };

  test('a current price is stale once the price snapshot is more than 24 hours old', async () => {
    await setPriceSnapshotAt(hoursAgo(23.9));
    const [fresh] = await currentPrices(curatorFoil);
    await setPriceSnapshotAt(hoursAgo(24.1));
    const [aged] = await currentPrices(curatorFoil);
    await setPriceSnapshotAt(pricesObservedAt);

    expect(fresh!.price?.stale).toBe(false);
    expect(aged!.price?.stale).toBe(true);
  });

  test('an exchange rate more than 4 days old leaves the USD current price fresh', async () => {
    await storeExchangeRates(undefined, daysAgo(5));

    const [usd] = await currentPrices(curatorFoil);
    await storeExchangeRates();

    expect(usd!.price).toEqual({ amount: '0.30', currency: 'USD', finish: 'foil', stale: false });
  });
});

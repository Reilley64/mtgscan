import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { getCollectionTotal } from '../collection';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { collectionCopies } from './collection-pages';
import { call, failed, refused, replyOf } from './database-calls';
import { daysAgo, storeExchangeRates } from './exchange-rate-seeds';
import { anonymousClient, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const tableNotFound = 'PGRST205';
const functionNotFound = 'PGRST202';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const secretLairNonfoilOnly = '018830b2-dff9-45f3-9cc2-dc5b2eec0e54';
const secretLairWithNoPrice = '0cd83c0e-8e37-40bf-87a5-5b4c009248fb';
const kjeldoranHomeGuardWithOnlyEurPrice = '45145931-16e8-4401-9d67-57856ffef0dc';

let pricesObservedAt: string;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
  await storeExchangeRates();
  const { data, error } = await secretKeyClient().from('import_snapshots').select('snapshot_at').eq('source', 'prices').single();
  expect(error).toBeNull();
  pricesObservedAt = data!.snapshot_at;
});

async function setPriceSnapshotAt(at: string) {
  const { error } = await secretKeyClient().from('import_snapshots').update({ snapshot_at: at }).eq('source', 'prices');
  expect(error).toBeNull();
}

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function collectionTotal(user: TestUser) {
  return replyOf(user.client, getCollectionTotal, {});
}

describe('the collection total read', () => {
  test('a user with no collection entries has a total of 0 with no copies', async () => {
    const user = await signUpNewUser();

    expect(await collectionTotal(user)).toEqual({
      total: '0.00',
      currency: 'USD',
      priced_copies: 0,
      copies: 0,
      stale: false,
      prices_observed_at: pricesObservedAt,
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
    ['a price currency, even USD, as the app converts prices itself', { price_currency: 'USD' }, 'price_currency'],
    ['an unknown field', { limit: 1 }, 'limit'],
  ])('%s is refused with invalid_argument', async (_, query, field) => {
    const user = await signUpNewUser();

    expect(await call(user.client, getCollectionTotal, query as never)).toMatchObject(refused('invalid_argument', field));
  });

  test.each([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot read a collection total', async (_, client) => {
    expect(await call(client(), getCollectionTotal, {})).toMatchObject(failed(permissionDenied));
  });
});

describe('the collection total with exchange rates stored', () => {
  test('the total is in USD, with no approximate flag, exchange rate, or rate date', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator, { copies: 2 }), stack(angelicCurator, { finish: 'foil' })]));

    expect(await collectionTotal(user)).toEqual({
      total: '0.72',
      currency: 'USD',
      priced_copies: 3,
      copies: 3,
      stale: false,
      prices_observed_at: pricesObservedAt,
    });
  });

  test('the USD total is the sum of the copy prices, so the app converts it once', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator, { copies: 5 })]));
    const copyPrices = (await collectionCopies(user.client)).items.map((row) => row.price?.amount);

    expect(copyPrices).toEqual(['0.21', '0.21', '0.21', '0.21', '0.21']);
    expect(await collectionTotal(user)).toMatchObject({ total: '1.05', currency: 'USD' });
  });
});

describe('a stale collection total', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator), stack(secretLairWithNoPrice, { finish: 'foil' })]));
  });

  afterAll(async () => {
    await setPriceSnapshotAt(pricesObservedAt);
    await storeExchangeRates();
  });

  test('the collection total is stale once the price snapshot is more than 24 hours old, and gives the time of the price snapshot', async () => {
    const fresh = hoursAgo(23.9);
    const aged = hoursAgo(24.1);

    await setPriceSnapshotAt(fresh);
    const freshTotal = await collectionTotal(user);
    await setPriceSnapshotAt(aged);
    const agedTotal = await collectionTotal(user);

    expect(freshTotal.stale).toBe(false);
    expect(Date.parse(freshTotal.prices_observed_at!)).toBe(Date.parse(fresh));
    expect(agedTotal.stale).toBe(true);
    expect(Date.parse(agedTotal.prices_observed_at!)).toBe(Date.parse(aged));
  });

  test('an exchange rate more than 4 days old leaves the USD total fresh', async () => {
    await setPriceSnapshotAt(hoursAgo(1));
    await storeExchangeRates(undefined, daysAgo(5));

    expect((await collectionTotal(user)).stale).toBe(false);
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

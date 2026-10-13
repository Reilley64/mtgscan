import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CollectionTotal, CollectionTotalQuery } from '../collection';
import type { Json } from '../database.types';
import { readSearchError } from '../search';
import {
  catalogFixtureManifest,
  resetCardCatalog,
  runCatalogImport,
  runImportCommand,
  runPriceImport,
} from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const secretLairNonfoilOnly = '018830b2-dff9-45f3-9cc2-dc5b2eec0e54';
const secretLairWithNoPrice = '0cd83c0e-8e37-40bf-87a5-5b4c009248fb';
const curatorNonfoilCents = 21;

let importedSnapshotAt: string;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
  const { data, error } = await secretKeyClient().from('import_snapshots').select('snapshot_at').eq('source', 'prices').single();
  expect(error).toBeNull();
  importedSnapshotAt = data!.snapshot_at;
});

afterEach(async () => {
  await setPriceSnapshotAt(importedSnapshotAt);
  await setCuratorNonfoilPrice(curatorNonfoilCents);
});

async function setPriceSnapshotAt(at: string) {
  const { error } = await secretKeyClient().from('import_snapshots').update({ snapshot_at: at }).eq('source', 'prices');
  expect(error).toBeNull();
}

async function setCuratorNonfoilPrice(cents: number) {
  const { error } = await secretKeyClient()
    .from('card_prices')
    .update({ usd_nonfoil_cents: cents })
    .eq('printing_id', angelicCurator);
  expect(error).toBeNull();
}

async function readCollectionTotal(client: AppClient, query: CollectionTotalQuery | Record<string, unknown> | unknown[] = {}) {
  const { data, error } = await client.rpc('get_collection_total', { query: query as Json });
  return { total: data as unknown as CollectionTotal | null, error: error && readSearchError(error) };
}

async function collectionTotal(user: TestUser, query: CollectionTotalQuery = {}) {
  const { total, error } = await readCollectionTotal(user.client, query);
  expect(error).toBeNull();
  return total!;
}

async function recordDailyCollectionTotals() {
  const { exitCode, output } = await runImportCommand('collection-totals');
  expect(output).toMatch(/Recorded \d+ daily collection totals\./);
  expect(exitCode).toBe(0);
}

async function recordDailyCollectionTotalsOn(day: string) {
  await setPriceSnapshotAt(`${day}T23:30:00.000Z`);
  await recordDailyCollectionTotals();
}

async function dailyCollectionTotals(client: AppClient) {
  const { data, error } = await client
    .from('collection_daily_totals')
    .select('day, currency, total_cents, priced_copies, copies, prices_snapshot_at')
    .order('day')
    .order('currency');
  expect(error).toBeNull();
  return data!;
}

function sameTime(actual: string, expected: string) {
  expect(Date.parse(actual)).toBe(Date.parse(expected));
}

describe('the collection total', () => {
  test('a user with no collection entries has a total of 0 with no copies and no change', async () => {
    const user = await signUpNewUser();

    expect(await collectionTotal(user)).toEqual({
      total: '0.00',
      currency: 'USD',
      priced_copies: 0,
      copies: 0,
      change: null,
      change_since: null,
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

describe('daily collection totals', () => {
  test("the daily workflow stores each user's total in USD and EUR for the day of the price snapshot", async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator, { copies: 2 }), stack(angelicCurator, { finish: 'etched' })]));

    await recordDailyCollectionTotalsOn('2026-10-20');

    const totals = await dailyCollectionTotals(user.client);
    expect(totals.map(({ prices_snapshot_at, ...total }) => total)).toEqual([
      { day: '2026-10-20', currency: 'USD', total_cents: 86, priced_copies: 3, copies: 3 },
      { day: '2026-10-20', currency: 'EUR', total_cents: 8, priced_copies: 2, copies: 3 },
    ]);
    totals.forEach((total) => sameTime(total.prices_snapshot_at, '2026-10-20T23:30:00.000Z'));
  });

  test('a user with no collection entries gets no daily total', async () => {
    const user = await signUpNewUser();

    await recordDailyCollectionTotalsOn('2026-10-20');

    expect(await dailyCollectionTotals(user.client)).toEqual([]);
  });

  test('there is no change while the only daily total is from the day of the current prices', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator)]));

    await recordDailyCollectionTotalsOn('2026-10-20');

    expect(await collectionTotal(user)).toMatchObject({ total: '0.21', change: null, change_since: null });
  });

  test('after the next price import, the change is the current total minus the daily total of the day before', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator, { copies: 2 })]));
    await recordDailyCollectionTotalsOn('2026-10-20');

    await setPriceSnapshotAt('2026-10-21T23:30:00.000Z');
    await setCuratorNonfoilPrice(121);

    expect(await collectionTotal(user)).toMatchObject({ total: '2.42', change: '2.00', change_since: '2026-10-20' });
  });

  test('a falling total has a negative change', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator, { copies: 2 })]));
    await recordDailyCollectionTotalsOn('2026-10-20');

    await setPriceSnapshotAt('2026-10-21T23:30:00.000Z');
    await setCuratorNonfoilPrice(1);

    expect(await collectionTotal(user)).toMatchObject({ total: '0.02', change: '-0.40' });
  });

  test('copies added since the daily total count in the change', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator)]));
    await recordDailyCollectionTotalsOn('2026-10-20');

    await setPriceSnapshotAt('2026-10-21T23:30:00.000Z');
    await committed(user, scanBatch([stack(angelicCurator, { copies: 3 })]));

    expect(await collectionTotal(user)).toMatchObject({ total: '0.84', change: '0.63' });
  });

  test('the change compares with the latest daily total before the day of the current prices', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator)]));
    await recordDailyCollectionTotalsOn('2026-10-19');
    await setCuratorNonfoilPrice(51);
    await recordDailyCollectionTotalsOn('2026-10-20');

    await setPriceSnapshotAt('2026-10-21T23:30:00.000Z');
    await setCuratorNonfoilPrice(71);

    expect(await collectionTotal(user)).toMatchObject({ total: '0.71', change: '0.20', change_since: '2026-10-20' });
  });

  test('a second run on the same price day keeps the first daily total', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator)]));
    await recordDailyCollectionTotalsOn('2026-10-20');
    const first = await dailyCollectionTotals(user.client);

    await committed(user, scanBatch([stack(angelicCurator)]));
    await recordDailyCollectionTotals();

    expect(await dailyCollectionTotals(user.client)).toEqual(first);
  });
});

describe('access to daily collection totals', () => {
  let alice: TestUser;

  beforeAll(async () => {
    alice = await signUpNewUser();
    await committed(alice, scanBatch([stack(angelicCurator)]));
    await recordDailyCollectionTotalsOn('2026-10-20');
  });

  test("a user never reads another user's daily collection totals", async () => {
    const stranger = await signUpNewUser();

    expect((await dailyCollectionTotals(alice.client)).map((total) => total.currency)).toEqual(['USD', 'EUR']);
    expect(await dailyCollectionTotals(stranger.client)).toEqual([]);
  });

  test('an anonymous caller cannot read daily collection totals', async () => {
    const { error } = await anonymousClient().from('collection_daily_totals').select('*');

    expect(error?.code).toBe(permissionDenied);
  });

  const row = { day: '2026-10-22', currency: 'USD', total_cents: 1, priced_copies: 1, copies: 1, prices_snapshot_at: '2026-10-22T00:00:00Z' } as const;

  test.each([
    ['insert', (client: AppClient, userId: string) => client.from('collection_daily_totals').insert({ ...row, user_id: userId })],
    ['update', (client: AppClient, userId: string) => client.from('collection_daily_totals').update({ total_cents: 0 }).eq('user_id', userId)],
    ['delete', (client: AppClient, userId: string) => client.from('collection_daily_totals').delete().eq('user_id', userId)],
  ])('a direct %s is refused for a signed-in user and an anonymous caller', async (_, write) => {
    const before = await dailyCollectionTotals(alice.client);

    expect((await write(alice.client, alice.userId)).error?.code).toBe(permissionDenied);
    expect((await write(anonymousClient(), alice.userId)).error?.code).toBe(permissionDenied);
    expect(await dailyCollectionTotals(alice.client)).toEqual(before);
  });

  test.each([
    ['a signed-in user', () => alice.client],
    ['the publishable key', anonymousClient],
  ])('%s cannot record daily collection totals', async (_, client) => {
    const { error } = await client().rpc('record_daily_collection_totals');

    expect(error?.code).toBe(permissionDenied);
  });
});

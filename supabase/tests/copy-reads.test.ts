import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CopyDetails, CopyQuery } from '../collection';
import type { Json } from '../database.types';
import { readSearchError } from '../search';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { seedCopies } from './copy-seeds';
import { daysAgo, storeExchangeRates } from './exchange-rate-seeds';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const blackLotusAlpha = 'b0faa7f2-b547-42c4-a810-839da50dadfe';
const secretLairWithNoPrice = '0cd83c0e-8e37-40bf-87a5-5b4c009248fb';
const curatorNonfoilCents = 21;

let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
  await storeExchangeRates();
});

afterEach(async () => {
  await setCuratorNonfoilPrice(curatorNonfoilCents);
  await storeExchangeRates();
});

async function setCuratorNonfoilPrice(cents: number) {
  const { error } = await secretKeyClient()
    .from('card_prices')
    .update({ usd_nonfoil_cents: cents })
    .eq('printing_id', angelicCurator);
  expect(error).toBeNull();
}

async function setPriceSnapshotAt(at: string) {
  const { error } = await secretKeyClient().from('import_snapshots').update({ snapshot_at: at }).eq('source', 'prices');
  expect(error).toBeNull();
}

async function readCopy(client: AppClient, query: CopyQuery | Record<string, unknown> | unknown[]) {
  const { data, error } = await client.rpc('get_copy', { query: query as Json });
  return { copy: data as unknown as CopyDetails | null, error: error && readSearchError(error) };
}

async function copyOf(user: TestUser, query: CopyQuery) {
  const { copy, error } = await readCopy(user.client, query);
  expect(error).toBeNull();
  return copy!;
}

async function scannedCopy(user: TestUser, ...args: Parameters<typeof stack>) {
  const scanned = stack(...args);
  const result = await committed(user, scanBatch([scanned]));
  return { copyId: scanned.copy_ids[0]!, addedAt: result.added_at! };
}

describe('the copy read', () => {
  test('returns the copy, its added time, its purchase-day price, its current price, its card printing, and the rules of its card', async () => {
    const { copyId, addedAt } = await scannedCopy(alice, angelicCurator, { condition: 'lightly_played', language: 'ja' });
    await setCuratorNonfoilPrice(35);

    const copy = await copyOf(alice, { copy_id: copyId });

    expect(copy).toEqual({
      copy_id: copyId,
      printing_id: angelicCurator,
      name: 'Angelic Curator',
      set: 'mh2',
      collector_number: '262',
      rarity: 'uncommon',
      image_uris: [expect.stringContaining('https://cards.scryfall.io/normal/')],
      art_crop_uri: expect.stringContaining('https://cards.scryfall.io/art_crop/front/'),
      finish: 'nonfoil',
      condition: 'lightly_played',
      language: 'ja',
      protected: false,
      free: true,
      added_at: expect.any(String),
      purchase_day_price: { amount: '0.21', currency: 'USD', finish: 'nonfoil' },
      price: { amount: '0.35', currency: 'USD', finish: 'nonfoil', stale: false },
      type_line: 'Creature — Angel Spirit',
      faces: [{ name: 'Angelic Curator', oracle_text: 'Flying, protection from artifacts' }],
      commander_legality: 'legal',
      user_tags: [],
    });
    expect(Date.parse(copy.added_at)).toBe(Date.parse(addedAt));
  });

  test('a card with two faces has the Oracle text of each face in order', async () => {
    const { copyId } = await scannedCopy(alice, delverInnistrad);

    const copy = await copyOf(alice, { copy_id: copyId });

    expect(copy).toMatchObject({
      art_crop_uri: expect.stringContaining('https://cards.scryfall.io/art_crop/front/'),
      type_line: 'Creature — Human Wizard // Creature — Human Insect',
      faces: [
        { name: 'Delver of Secrets', oracle_text: expect.stringMatching(/^At the beginning of your upkeep/) },
        { name: 'Insectile Aberration', oracle_text: 'Flying' },
      ],
    });
  });

  test('a card that is banned in Commander says so', async () => {
    const { copyId } = await scannedCopy(alice, blackLotusAlpha);

    expect((await copyOf(alice, { copy_id: copyId })).commander_legality).toBe('banned');
  });

  test('a foil copy has the USD prices of its finish', async () => {
    const { copyId } = await scannedCopy(alice, angelicCurator, { finish: 'foil' });

    const copy = await copyOf(alice, { copy_id: copyId, price_currency: 'USD' });

    expect(copy).toMatchObject({
      finish: 'foil',
      purchase_day_price: { amount: '0.30', currency: 'USD', finish: 'foil' },
      price: { amount: '0.30', currency: 'USD', finish: 'foil', stale: false },
    });
  });

  test('a copy of a card printing with only a Scryfall EUR price has no current price and no purchase-day price', async () => {
    const { copyId } = await scannedCopy(alice, blackLotusAlpha);

    expect(await copyOf(alice, { copy_id: copyId })).toMatchObject({ purchase_day_price: null, price: null });
  });

  test('a copy with no price for its card printing and finish has no current price and no purchase-day price', async () => {
    const { copyId } = await scannedCopy(alice, secretLairWithNoPrice, { finish: 'foil' });

    expect(await copyOf(alice, { copy_id: copyId })).toMatchObject({ purchase_day_price: null, price: null });
  });

  test('the current price is stale once the price snapshot is more than 24 hours old', async () => {
    const { copyId } = await scannedCopy(alice, angelicCurator);
    const { data, error } = await secretKeyClient().from('import_snapshots').select('snapshot_at').eq('source', 'prices').single();
    expect(error).toBeNull();

    await setPriceSnapshotAt(new Date(Date.now() - 24.1 * 60 * 60 * 1000).toISOString());
    const copy = await copyOf(alice, { copy_id: copyId });
    await setPriceSnapshotAt(data!.snapshot_at);

    expect(copy.price).toEqual({ amount: '0.21', currency: 'USD', finish: 'nonfoil', stale: true });
  });

  test('a protected copy is protected and free', async () => {
    const [[copyId]] = await seedCopies(alice, [{ card_printing_id: angelicCurator, is_protected: true }]);

    expect(await copyOf(alice, { copy_id: copyId! })).toMatchObject({ protected: true, free: true });
  });

  test.each<[string, Record<string, unknown> | unknown[], string | null]>([
    ['a query that is not an object', [], null],
    ['a query with no copy ID', {}, 'copy_id'],
    ['a copy ID that is not a UUID', { copy_id: 'copy-1' }, 'copy_id'],
    ['a price currency with no exchange rate', { copy_id: crypto.randomUUID(), price_currency: 'GBP' }, 'price_currency'],
    ['a price currency that is not a string', { copy_id: crypto.randomUUID(), price_currency: 36 }, 'price_currency'],
    ['an unknown field', { copy_id: crypto.randomUUID(), rows: 'copies' }, 'rows'],
  ])('%s is refused with invalid_argument', async (_, query, field) => {
    const { copy, error } = await readCopy(alice.client, query);

    expect(copy).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
  });

  test('a copy ID that is not in the collection is not_found', async () => {
    const { error } = await readCopy(alice.client, { copy_id: crypto.randomUUID() });

    expect(error).toMatchObject({ code: 'not_found', field: 'copy_id' });
  });
});

describe('the copy read in another currency', () => {
  function converted(currency: string, exchangeRate: string, amount: string, rateDate = daysAgo(0)): CopyDetails['purchase_day_price'] {
    return { amount, currency, finish: 'nonfoil', approximate: true, exchange_rate: exchangeRate, rate_date: rateDate };
  }

  test.each<[string, string, string, string]>([
    ['AUD', '1.5234', '0.32', '0.53'],
    ['EUR', '0.93', '0.20', '0.33'],
    ['JPY', '151.37', '32', '53'],
  ])('the purchase-day price and the current price in %s convert from USD at the exchange rate', async (currency, exchangeRate, purchaseDay, current) => {
    const { copyId } = await scannedCopy(alice, angelicCurator);
    await setCuratorNonfoilPrice(35);

    expect(await copyOf(alice, { copy_id: copyId, price_currency: currency })).toMatchObject({
      purchase_day_price: converted(currency, exchangeRate, purchaseDay),
      price: { ...converted(currency, exchangeRate, current)!, stale: false },
    });
  });

  test('the purchase-day price converts at the latest exchange rate, not the rate of the day of its addition', async () => {
    const { copyId } = await scannedCopy(alice, angelicCurator);

    await storeExchangeRates({ AUD: 2 });
    const copy = await copyOf(alice, { copy_id: copyId, price_currency: 'AUD' });

    expect(copy.purchase_day_price).toEqual(converted('AUD', '2', '0.42'));
  });

  test('a USD copy has no approximate flag, exchange rate, or rate date', async () => {
    const { copyId } = await scannedCopy(alice, angelicCurator);

    expect(await copyOf(alice, { copy_id: copyId, price_currency: 'USD' })).toMatchObject({
      purchase_day_price: { amount: '0.21', currency: 'USD', finish: 'nonfoil' },
      price: { amount: '0.21', currency: 'USD', finish: 'nonfoil', stale: false },
    });
  });

  test('a copy with no USD price has no price in another currency', async () => {
    const { copyId } = await scannedCopy(alice, blackLotusAlpha);

    expect(await copyOf(alice, { copy_id: copyId, price_currency: 'AUD' })).toMatchObject({ purchase_day_price: null, price: null });
  });

  test.each<[string, number, boolean]>([
    ["Friday's rate on a Monday", 3, false],
    ['a rate more than 4 days old', 5, true],
  ])('with %s, the converted current price is stale: %p', async (_, age, stale) => {
    const { copyId } = await scannedCopy(alice, angelicCurator);

    await storeExchangeRates(undefined, daysAgo(age));
    const aud = await copyOf(alice, { copy_id: copyId, price_currency: 'AUD' });
    const usd = await copyOf(alice, { copy_id: copyId, price_currency: 'USD' });

    expect(aud.price).toEqual({ ...converted('AUD', '1.5234', '0.32', daysAgo(age))!, stale });
    expect(usd.price!.stale).toBe(false);
  });

  test('a converted current price is stale when the USD price is stale', async () => {
    const { copyId } = await scannedCopy(alice, angelicCurator);
    const { data, error } = await secretKeyClient().from('import_snapshots').select('snapshot_at').eq('source', 'prices').single();
    expect(error).toBeNull();

    await setPriceSnapshotAt(new Date(Date.now() - 24.1 * 60 * 60 * 1000).toISOString());
    const copy = await copyOf(alice, { copy_id: copyId, price_currency: 'AUD' });
    await setPriceSnapshotAt(data!.snapshot_at);

    expect(copy.price!.stale).toBe(true);
  });
});

describe('access', () => {
  test("another user's copy is not_found", async () => {
    const { copyId } = await scannedCopy(alice, angelicCurator);
    const bob = await signUpNewUser();

    const { copy, error } = await readCopy(bob.client, { copy_id: copyId });

    expect(copy).toBeNull();
    expect(error).toMatchObject({ code: 'not_found', field: 'copy_id' });
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot read a copy', async (_, client) => {
    const { copyId } = await scannedCopy(alice, angelicCurator);

    const { data, error } = await client().rpc('get_copy', { query: { copy_id: copyId } });

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });
});

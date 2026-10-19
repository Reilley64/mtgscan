import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { getCopy, type CopyQuery } from '../collection';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { seedCopies } from './copy-seeds';
import { call, failed, refused, replyOf } from './database-calls';
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

function copyOf(user: TestUser, query: CopyQuery) {
  return replyOf(user.client, getCopy, query);
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
      deck: null,
      held_for: null,
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

    const copy = await copyOf(alice, { copy_id: copyId });

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
    ['a price currency, even USD, as the app converts prices itself', { copy_id: crypto.randomUUID(), price_currency: 'USD' }, 'price_currency'],
    ['an unknown field', { copy_id: crypto.randomUUID(), rows: 'copies' }, 'rows'],
  ])('%s is refused with invalid_argument', async (_, query, field) => {
    expect(await call(alice.client, getCopy, query as never)).toMatchObject(refused('invalid_argument', field));
  });

  test('a copy ID that is not in the collection is not_found', async () => {
    const result = await call(alice.client, getCopy, { copy_id: crypto.randomUUID() });

    expect(result).toMatchObject(refused('not_found', 'copy_id'));
  });
});

describe('the copy read with exchange rates stored', () => {
  test('the purchase-day price and the current price stay in USD, with no approximate flag, exchange rate, or rate date', async () => {
    const { copyId } = await scannedCopy(alice, angelicCurator);
    await setCuratorNonfoilPrice(35);

    const copy = await copyOf(alice, { copy_id: copyId });

    expect(copy.purchase_day_price).toEqual({ amount: '0.21', currency: 'USD', finish: 'nonfoil' });
    expect(copy.price).toEqual({ amount: '0.35', currency: 'USD', finish: 'nonfoil', stale: false });
  });

  test('an exchange rate more than 4 days old leaves the USD current price fresh', async () => {
    const { copyId } = await scannedCopy(alice, angelicCurator);

    await storeExchangeRates(undefined, daysAgo(5));

    expect((await copyOf(alice, { copy_id: copyId })).price!.stale).toBe(false);
  });
});

describe('access', () => {
  test("another user's copy is not_found", async () => {
    const { copyId } = await scannedCopy(alice, angelicCurator);
    const bob = await signUpNewUser();

    const result = await call(bob.client, getCopy, { copy_id: copyId });

    expect(result).toMatchObject(refused('not_found', 'copy_id'));
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot read a copy', async (_, client) => {
    const { copyId } = await scannedCopy(alice, angelicCurator);

    expect(await call(client(), getCopy, { copy_id: copyId })).toMatchObject(failed(permissionDenied));
  });
});

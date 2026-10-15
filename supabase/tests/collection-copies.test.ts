import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CollectionCopyRow, CollectionQuery, CollectionRow, CurrentPrice } from '../collection';
import type { Json } from '../database.types';
import { usdPriceBounds, type PriceBounds } from '../converted-prices';
import { readSearchError, type Finish, type SearchPage } from '../search';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { seedCopies } from './copy-seeds';
import { exchangeRateOf, storeExchangeRates } from './exchange-rate-seeds';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const ribbonsOfNight = '010eba83-30ec-4cca-b07e-f24d8d2f0787';
const secretLairNonfoilOnly = '018830b2-dff9-45f3-9cc2-dc5b2eec0e54';
const secretLairWithNoPrice = '0cd83c0e-8e37-40bf-87a5-5b4c009248fb';
const kjeldoranHomeGuardWithOnlyEurPrice = '45145931-16e8-4401-9d67-57856ffef0dc';

type CatalogPrinting = Pick<CollectionCopyRow, 'printing_id' | 'name' | 'set' | 'collector_number' | 'rarity' | 'image_uris'>;

let catalog: CatalogPrinting[];
let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
  await storeExchangeRates();
  const { data, error } = await secretKeyClient()
    .from('card_printings')
    .select('id, set_code, collector_number, rarity, image_uris, cards(name)')
    .order('id');
  expect(error).toBeNull();
  catalog = data!.map((printing) => ({
    printing_id: printing.id,
    name: printing.cards!.name,
    set: printing.set_code,
    collector_number: printing.collector_number,
    rarity: printing.rarity,
    image_uris: printing.image_uris,
  }));
});

function catalogPrinting(printingId: string): CatalogPrinting {
  const printing = catalog.find((candidate) => candidate.printing_id === printingId);
  if (!printing) {
    throw new Error(`${printingId} is not in the catalog fixture`);
  }
  return printing;
}

async function searchCopies(client: AppClient, query: CollectionQuery | Record<string, unknown> = {}) {
  const { data, error } = await client.rpc('search_collection', { query: { rows: 'copies', ...query } as Json });
  return { page: data as unknown as SearchPage<CollectionCopyRow> | null, error: error && readSearchError(error) };
}

async function collectionCopies(user: TestUser, query: CollectionQuery = {}) {
  const { page, error } = await searchCopies(user.client, query);
  expect(error).toBeNull();
  return page!;
}

async function allCollectionCopies(user: TestUser, limit: number, query: CollectionQuery = {}) {
  const rows: CollectionCopyRow[] = [];
  const sizes: number[] = [];
  let cursor: string | null = null;
  do {
    const page = await collectionCopies(user, { ...query, limit, cursor });
    rows.push(...page.items);
    sizes.push(page.items.length);
    cursor = page.next_cursor;
  } while (cursor);
  return { rows, sizes };
}

function printingIds(rows: CollectionCopyRow[]) {
  return rows.map((row) => row.printing_id);
}

function copyIdsOf(rows: CollectionCopyRow[]) {
  return rows.map((row) => row.copy_id);
}

function byCopyId(a: Pick<CollectionCopyRow, 'copy_id'>, b: typeof a) {
  return a.copy_id < b.copy_id ? -1 : 1;
}

function currentPrice(currency: CurrentPrice['currency'], amount: string, finish: CurrentPrice['finish']): CurrentPrice {
  return { amount, currency, finish, stale: false };
}

describe('copy rows', () => {
  test('a user with no copies gets an empty page', async () => {
    const user = await signUpNewUser();

    expect(await collectionCopies(user)).toMatchObject({ items: [], next_cursor: null });
  });

  test('each copy is one row with its copy ID, card printing and rarity, finish, condition, language, protected flag, and price', async () => {
    const user = await signUpNewUser();
    const nonfoil = stack(angelicCurator, { copies: 2 });
    const foilCopy = stack(angelicCurator, { finish: 'foil', condition: 'lightly_played', language: 'ja' });
    await committed(user, scanBatch([nonfoil, foilCopy]));
    const [protectedCopies] = await seedCopies(user, [
      { card_printing_id: angelicCurator, added_at: new Date(0).toISOString(), quantity: 2, is_protected: true },
    ]);
    const copy = (copyId: string, changes: Partial<CollectionCopyRow> = {}): CollectionCopyRow => ({
      copy_id: copyId,
      ...catalogPrinting(angelicCurator),
      finish: 'nonfoil',
      condition: 'near_mint',
      language: 'en',
      protected: false,
      price: currentPrice('USD', '0.21', 'nonfoil'),
      ...changes,
    });
    const foil = { finish: 'foil', condition: 'lightly_played', language: 'ja', price: currentPrice('USD', '0.30', 'foil') } as const;
    const expected = [
      ...nonfoil.copy_ids.map((copyId) => copy(copyId)),
      copy(foilCopy.copy_ids[0]!, foil),
      ...protectedCopies!.map((copyId) => copy(copyId, { protected: true })),
    ];

    const { items, next_cursor } = await collectionCopies(user);

    expect(next_cursor).toBeNull();
    expect(items).toEqual(expected.sort(byCopyId));
  });

  test('each scanned copy keeps its copy ID when more copies of the same card printing are added', async () => {
    const user = await signUpNewUser();
    const first = stack(angelicCurator, { copies: 2 });
    await committed(user, scanBatch([first]));
    const second = stack(angelicCurator);

    await committed(user, scanBatch([second]));

    expect(copyIdsOf((await collectionCopies(user)).items).toSorted()).toEqual([...first.copy_ids, ...second.copy_ids].toSorted());
  });

  test('the newest addition comes first, and copies of the same card printing sit next to each other', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator)]));
    await committed(user, scanBatch([stack(delverInnistrad)]));
    await committed(user, scanBatch([stack(ribbonsOfNight, { copies: 2 })]));
    await committed(user, scanBatch([stack(angelicCurator, { finish: 'foil' })]));

    const { items } = await collectionCopies(user);

    expect(printingIds(items)).toEqual([angelicCurator, angelicCurator, ribbonsOfNight, ribbonsOfNight, delverInnistrad]);
  });

  test('with no text, relevance gives the same order as sort added, and sort added in ascending order puts the oldest addition first', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator)]));
    await committed(user, scanBatch([stack(delverInnistrad)]));
    await committed(user, scanBatch([stack(ribbonsOfNight)]));

    const relevance = (await collectionCopies(user, { sort: 'relevance' })).items;
    const added = (await collectionCopies(user, { sort: 'added' })).items;
    const oldestFirst = (await collectionCopies(user, { sort: 'added', sort_order: 'asc' })).items;

    expect(printingIds(added)).toEqual([ribbonsOfNight, delverInnistrad, angelicCurator]);
    expect(printingIds(relevance)).toEqual(printingIds(added));
    expect(printingIds(oldestFirst)).toEqual([angelicCurator, delverInnistrad, ribbonsOfNight]);
  });

  test('card printings added at the same time sort by name, then by card printing ID', async () => {
    const user = await signUpNewUser();
    const addedAt = '2026-10-18T09:00:00.000Z';
    const sameName = catalog.filter((printing) => printing.name === catalogPrinting(delverInnistrad).name);
    expect(sameName.length).toBeGreaterThan(1);
    const byName = [catalogPrinting(angelicCurator), ...sameName, catalogPrinting(ribbonsOfNight)];
    await seedCopies(
      user,
      [...byName].reverse().map((printing) => ({
        card_printing_id: printing.printing_id,
        added_at: addedAt,
        quantity: 2,
      })),
    );

    const { items } = await collectionCopies(user);

    expect(printingIds(items)).toEqual(
      [angelicCurator, ...sameName.map((printing) => printing.printing_id).sort(), ribbonsOfNight].flatMap((id) => [id, id]),
    );
  });
});

describe('current prices', () => {
  function pricesByFinish(rows: CollectionCopyRow[]) {
    return rows.map((row) => [row.finish, row.price]);
  }

  test('each copy has the current USD price of its card printing and finish, whatever its condition and language', async () => {
    const user = await signUpNewUser();
    await committed(
      user,
      scanBatch([
        stack(angelicCurator),
        stack(angelicCurator, { finish: 'foil', condition: 'damaged', language: 'ja' }),
        stack(angelicCurator, { finish: 'etched', condition: 'moderately_played', language: 'de' }),
      ]),
    );

    const { items } = await collectionCopies(user);

    expect(pricesByFinish(items).sort()).toEqual([
      ['etched', currentPrice('USD', '0.44', 'etched')],
      ['foil', currentPrice('USD', '0.30', 'foil')],
      ['nonfoil', currentPrice('USD', '0.21', 'nonfoil')],
    ]);
  });

  test('a copy of a card printing with only a Scryfall EUR price has no price', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(kjeldoranHomeGuardWithOnlyEurPrice)]));

    const { items } = await collectionCopies(user);

    expect(items.map((row) => row.price)).toEqual([null]);
  });

  test('a copy with no price for its card printing and finish has no price, never the price of another finish', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(secretLairNonfoilOnly), stack(secretLairWithNoPrice, { finish: 'foil' })]));

    const { items } = await collectionCopies(user);

    expect(items.map((row) => [row.printing_id, row.price]).sort()).toEqual(
      [
        [secretLairNonfoilOnly, currentPrice('USD', '4.41', 'nonfoil')],
        [secretLairWithNoPrice, null],
      ].sort(),
    );
  });

  describe('when the current prices age', () => {
    let snapshotAt: string;

    beforeAll(async () => {
      const { data, error } = await secretKeyClient().from('import_snapshots').select('snapshot_at').eq('source', 'prices').single();
      expect(error).toBeNull();
      snapshotAt = data!.snapshot_at;
    });

    afterAll(async () => {
      await setPriceSnapshotAt(snapshotAt);
    });

    async function setPriceSnapshotAt(at: string) {
      const { error } = await secretKeyClient().from('import_snapshots').update({ snapshot_at: at }).eq('source', 'prices');
      expect(error).toBeNull();
    }

    function hoursAgo(hours: number) {
      return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    }

    test('every current price is stale once the price snapshot is more than 24 hours old', async () => {
      const user = await signUpNewUser();
      await committed(user, scanBatch([stack(angelicCurator), stack(ribbonsOfNight), stack(secretLairWithNoPrice, { finish: 'foil' })]));

      await setPriceSnapshotAt(hoursAgo(23.9));
      const fresh = (await collectionCopies(user)).items.map((row) => row.price?.stale);
      await setPriceSnapshotAt(hoursAgo(24.1));
      const aged = (await collectionCopies(user)).items.map((row) => row.price?.stale);

      expect(fresh.sort()).toEqual([false, false, undefined]);
      expect(aged.sort()).toEqual([true, true, undefined]);
    });
  });
});

describe('current prices with exchange rates stored', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await signUpNewUser();
    await committed(
      user,
      scanBatch([
        stack(angelicCurator),
        stack(angelicCurator, { finish: 'foil' }),
        stack(angelicCurator, { finish: 'etched' }),
        stack(kjeldoranHomeGuardWithOnlyEurPrice),
      ]),
    );
  });

  function pricesByFinish(rows: CollectionCopyRow[]) {
    return rows.filter((row) => row.price).map((row) => [row.finish, row.price]).sort();
  }

  test('prices and their page are in USD, with no approximate flag, exchange rate, or rate date', async () => {
    const page = await collectionCopies(user);

    expect(pricesByFinish(page.items)).toEqual([
      ['etched', currentPrice('USD', '0.44', 'etched')],
      ['foil', currentPrice('USD', '0.30', 'foil')],
      ['nonfoil', currentPrice('USD', '0.21', 'nonfoil')],
    ]);
    expect(page).not.toHaveProperty('rate_date');
  });

  test('a copy with no USD price has no price', async () => {
    const { items } = await collectionCopies(user);

    expect(items.find((row) => row.printing_id === kjeldoranHomeGuardWithOnlyEurPrice)!.price).toBeNull();
  });

  test.each<[string, CollectionQuery, Finish[]]>([
    ['a USD range whose bounds equal the prices', { price_min: '0.21', price_max: '0.30' }, ['foil', 'nonfoil']],
    ['a USD maximum just below a price', { price_max: '0.20' }, []],
    ['a USD minimum equal to a price', { price_min: '0.44' }, ['etched']],
  ])('%s matches every price inside it, bounds included', async (_, query, finishes) => {
    const { items } = await collectionCopies(user, query);

    expect(items.map((row) => row.finish).sort()).toEqual(finishes);
  });

  test.each<[string, string, PriceBounds, Finish[]]>([
    ['an AUD price range', 'AUD', { price_min: '0.40', price_max: '0.50' }, ['foil']],
    ['a JPY maximum equal to a shown price', 'JPY', { price_max: '45' }, ['foil', 'nonfoil']],
    ['a EUR minimum equal to a shown price', 'EUR', { price_min: '0.41' }, ['etched']],
    ['a EUR range whose bounds equal the shown prices', 'EUR', { price_min: '0.20', price_max: '0.28' }, ['foil', 'nonfoil']],
    ['a EUR maximum just below a shown price', 'EUR', { price_max: '0.19' }, []],
  ])('%s, converted to USD at the stored exchange rate, matches the copies whose converted price shows inside it', async (_, currency, bounds, finishes) => {
    const usdBounds = usdPriceBounds(bounds, await exchangeRateOf(user.client, currency));

    const { items } = await collectionCopies(user, usdBounds);

    expect(items.map((row) => row.finish).sort()).toEqual(finishes);
  });
});

describe('pages of copy rows', () => {
  const seededPrintings = 50;
  const seededCopies = 123;
  let user: TestUser;
  let seeded: string[];

  beforeAll(async () => {
    user = await signUpNewUser();
    const start = Date.parse('2026-10-18T09:00:00.000Z');
    const seeds = catalog.slice(0, seededPrintings).map((printing, index) => ({
      card_printing_id: printing.printing_id,
      added_at: new Date(start + Math.floor(index / 2) * 1000).toISOString(),
      quantity: (index % 4) + 1,
    }));
    seeded = (await seedCopies(user, seeds)).flat();
  });

  test('the first page holds 60 copies', async () => {
    const { items, next_cursor } = await collectionCopies(user);

    expect(items.length).toBe(60);
    expect(next_cursor).toEqual(expect.any(String));
  });

  test('pages of 1 cover every copy once', async () => {
    const { rows } = await allCollectionCopies(user, 1);

    expect(rows.length).toBe(seededCopies);
    expect(copyIdsOf(rows).toSorted()).toEqual(seeded.toSorted());
  });

  test.each([
    [60, [60, 60, 3]],
    [120, [120, 3]],
  ])('pages of %p cover every copy once, in the same order', async (limit, pageSizes) => {
    const reference = copyIdsOf((await allCollectionCopies(user, 1)).rows);

    const { rows, sizes } = await allCollectionCopies(user, limit);

    expect(copyIdsOf(rows)).toEqual(reference);
    expect(sizes).toEqual(pageSizes);
  });

  test.each(['relevance', 'added', 'name', 'mana_value', 'edhrec_rank', 'price', 'release_date'] as const)(
    'sort %p and its reverse cover every copy once, in the same order in pages of 1 and of 120',
    async (sort) => {
      for (const sort_order of ['asc', 'desc'] as const) {
        const query: CollectionQuery = sort === 'relevance' ? { sort, sort_order, text: 'a' } : { sort, sort_order };
        const reference = copyIdsOf((await allCollectionCopies(user, 120, query)).rows);

        const { rows } = await allCollectionCopies(user, 1, query);

        expect(copyIdsOf(rows)).toEqual(reference);
        expect(new Set(reference).size).toBe(reference.length);
        if (sort !== 'relevance') {
          expect(reference.toSorted()).toEqual(seeded.toSorted());
        }
      }
    },
  );

  test.each<[string, Record<string, unknown> | unknown[], string | null]>([
    ['a query that is not an object', [], null],
    ['a limit of 0', { limit: 0 }, 'limit'],
    ['a limit of 121', { limit: 121 }, 'limit'],
    ['a limit that is not a number', { limit: '60' }, 'limit'],
    ['a cursor that is not a string', { cursor: 7 }, 'cursor'],
    ['an unknown field', { owned_only: true }, 'owned_only'],
    ['a price currency, even USD, as the app converts prices itself', { price_currency: 'USD' }, 'price_currency'],
    ['rows other than entries or copies', { rows: 'printings' }, 'rows'],
  ])('%s is refused with invalid_argument', async (_, query, field) => {
    const { data, error } = await user.client.rpc('search_collection', {
      query: (Array.isArray(query) ? query : { rows: 'copies', ...query }) as Json,
    });

    expect(data).toBeNull();
    expect(error && readSearchError(error)).toMatchObject({ code: 'invalid_argument', field });
  });

  test('a malformed cursor is refused with invalid_cursor', async () => {
    const { error } = await searchCopies(user.client, { cursor: 'not a cursor' });

    expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
  });

  test('a cursor with a broken copy ID is refused with invalid_cursor', async () => {
    const { next_cursor } = await collectionCopies(user, { limit: 1 });
    const payload = JSON.parse(Buffer.from(next_cursor!, 'base64').toString('utf8'));
    const broken = Buffer.from(
      JSON.stringify({ ...payload, after: [...payload.after.slice(0, 5), 'first'] }),
    ).toString('base64');

    const { error } = await searchCopies(user.client, { limit: 1, cursor: broken });

    expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
  });

  test('a cursor from collection entries is refused for copy rows', async () => {
    const { next_cursor } = await collectionCopies(user, { rows: 'entries', limit: 1 });

    const { error } = await searchCopies(user.client, { limit: 1, cursor: next_cursor });

    expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
  });
});

describe('collection entries and copy rows', () => {
  let user: TestUser;
  let protectedCopies: string[];

  beforeAll(async () => {
    user = await signUpNewUser();
    protectedCopies = (await seedCopies(user, [{ card_printing_id: ribbonsOfNight, is_protected: true }]))[0]!;
    await committed(
      user,
      scanBatch([
        stack(angelicCurator, { copies: 3 }),
        stack(angelicCurator, { finish: 'foil', copies: 2 }),
        stack(delverInnistrad, { condition: 'damaged' }),
        stack(ribbonsOfNight, { copies: 2 }),
      ]),
    );
  });

  function entryKey(row: Pick<CollectionCopyRow, 'printing_id' | 'finish' | 'condition' | 'language' | 'protected'>) {
    return [row.printing_id, row.finish, row.condition, row.language, row.protected].join(' ');
  }

  async function entryQuantities(query: CollectionQuery) {
    const { page, error } = await searchCopies(user.client, { ...query, rows: 'entries' });
    expect(error).toBeNull();
    const rows = page!.items as unknown as CollectionRow[];
    return Object.fromEntries(rows.map((row) => [entryKey(row), row.quantity]).toSorted());
  }

  async function copiesPerEntry(query: CollectionQuery) {
    const counts = new Map<string, number>();
    for (const row of (await collectionCopies(user, query)).items) {
      counts.set(entryKey(row), (counts.get(entryKey(row)) ?? 0) + 1);
    }
    return Object.fromEntries([...counts].toSorted());
  }

  test.each<[string, CollectionQuery]>([
    ['no chips', {}],
    ['a name chip', { names: ['curator'] }],
    ['a finish chip', { finishes: ['foil'] }],
    ['a negated condition chip', { conditions_exclude: ['damaged'] }],
  ])("with %s, each collection entry's quantity counts its matching copy rows", async (_, query) => {
    const entries = await entryQuantities(query);

    expect(Object.keys(entries).length).toBeGreaterThan(0);
    expect(entries).toEqual(await copiesPerEntry(query));
  });

  test('the free chip with the negated protected chip gives the free copies that are not protected', async () => {
    const every = copyIdsOf((await collectionCopies(user)).items);
    const free = copyIdsOf((await collectionCopies(user, { is_free: true })).items);
    const freeAndNotProtected = copyIdsOf((await collectionCopies(user, { is_free: true, is_protected: false })).items);

    expect(free.toSorted()).toEqual(every.toSorted());
    expect(freeAndNotProtected.toSorted()).toEqual(every.filter((copyId) => !protectedCopies.includes(copyId)).toSorted());
    expect((await collectionCopies(user, { is_free: false })).items).toEqual([]);
  });

  test('collection entries take a limit up to 50, and copy rows up to 120', async () => {
    const entries = await searchCopies(user.client, { rows: 'entries', limit: 51 });
    const copies = await searchCopies(user.client, { limit: 120 });

    expect(entries.error).toMatchObject({ code: 'invalid_argument', field: 'limit' });
    expect(copies.error).toBeNull();
  });
});

describe('telemetry', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator, { copies: 2 }), stack(ribbonsOfNight)]));
  });

  async function telemetryRows() {
    const { data, error } = await secretKeyClient()
      .from('search_telemetry')
      .select('search_id, api, query, result_count, result_ids')
      .eq('user_id', user.userId);
    expect(error).toBeNull();
    return data!;
  }

  test.each<[string, CollectionQuery]>([
    ['a plain binder read', {}],
    ['a plain binder read in another order', { sort: 'price', sort_order: 'desc', limit: 120 }],
    ['a plain read of collection entries', { rows: 'entries' }],
  ])('%s writes no telemetry row', async (_, query) => {
    const before = await telemetryRows();

    await collectionCopies(user, query);

    expect(await telemetryRows()).toEqual(before);
  });

  test.each<[string, CollectionQuery]>([
    ['text', { text: 'curator' }],
    ['a filter', { finishes: ['nonfoil'] }],
  ])('a first page with %s writes one telemetry row with its copy IDs', async (_, query) => {
    const first = await collectionCopies(user, query);
    await collectionCopies(user, { ...query, limit: 1 });

    const rows = (await telemetryRows()).filter((row) => row.search_id === first.search_id);

    expect(rows).toEqual([
      {
        search_id: first.search_id,
        api: 'collection',
        query: expect.objectContaining({ ...query, rows: 'copies', limit: 60 }),
        result_count: first.items.length,
        result_ids: copyIdsOf(first.items),
      },
    ]);
  });
});

describe('access', () => {
  beforeAll(async () => {
    await committed(alice, scanBatch([stack(ribbonsOfNight, { copies: 2 })]));
  });

  test("a user never reads another user's copies", async () => {
    const stranger = await signUpNewUser();

    expect(printingIds((await collectionCopies(alice)).items)).toEqual([ribbonsOfNight, ribbonsOfNight]);
    expect((await collectionCopies(stranger)).items).toEqual([]);
  });
});

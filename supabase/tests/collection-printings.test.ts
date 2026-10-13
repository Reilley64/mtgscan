import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { type CollectionPrintingRow, type CollectionPrintingsPage, type CollectionPrintingsQuery } from '../collection';
import type { Json } from '../database.types';
import { readSearchError } from '../search';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { seedCollectionEntries } from './collection-entry-seeds';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const ribbonsOfNight = '010eba83-30ec-4cca-b07e-f24d8d2f0787';

type CatalogPrinting = Pick<CollectionPrintingRow, 'printing_id' | 'name' | 'set' | 'collector_number' | 'image_uris'>;

let catalog: CatalogPrinting[];
let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  const { data, error } = await secretKeyClient()
    .from('card_printings')
    .select('id, set_code, collector_number, image_uris, cards(name)')
    .order('id');
  expect(error).toBeNull();
  catalog = data!.map((printing) => ({
    printing_id: printing.id,
    name: printing.cards!.name,
    set: printing.set_code,
    collector_number: printing.collector_number,
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

async function listCollectionPrintings(
  client: AppClient,
  query: CollectionPrintingsQuery | Record<string, unknown> | unknown[] = {},
) {
  const { data, error } = await client.rpc('list_collection_printings', { query: query as Json });
  return { page: data as unknown as CollectionPrintingsPage | null, error: error && readSearchError(error) };
}

async function collectionPrintings(user: TestUser, query: CollectionPrintingsQuery = {}) {
  const { page, error } = await listCollectionPrintings(user.client, query);
  expect(error).toBeNull();
  return page!;
}

async function allCollectionPrintings(user: TestUser, limit: number) {
  const rows: CollectionPrintingRow[] = [];
  const sizes: number[] = [];
  let cursor: string | null = null;
  do {
    const page = await collectionPrintings(user, { limit, cursor });
    rows.push(...page.items);
    sizes.push(page.items.length);
    cursor = page.next_cursor;
  } while (cursor);
  return { rows, sizes };
}

function printingIds(rows: CollectionPrintingRow[]) {
  return rows.map((row) => row.printing_id);
}

describe('the binder grid read', () => {
  test('a user with no collection entries gets an empty page', async () => {
    const user = await signUpNewUser();

    expect(await collectionPrintings(user)).toEqual({ items: [], next_cursor: null });
  });

  test('each card printing is one row with its owned quantity summed over all its collection entries', async () => {
    const user = await signUpNewUser();
    await committed(
      user,
      scanBatch([
        stack(angelicCurator, { copies: 2 }),
        stack(angelicCurator, { finish: 'foil' }),
        stack(angelicCurator, { condition: 'lightly_played', language: 'ja', copies: 3 }),
        stack(delverInnistrad),
      ]),
    );
    const latest = await committed(user, scanBatch([stack(angelicCurator, { copies: 4 })]));

    const { items, next_cursor } = await collectionPrintings(user);

    expect(next_cursor).toBeNull();
    expect(items).toEqual([
      {
        ...catalogPrinting(angelicCurator),
        owned_quantity: 10,
        latest_addition_at: expect.any(String),
      },
      {
        ...catalogPrinting(delverInnistrad),
        owned_quantity: 1,
        latest_addition_at: expect.any(String),
      },
    ]);
    expect(new Date(items[0]!.latest_addition_at).getTime()).toBe(new Date(latest.added_at!).getTime());
  });

  test('the owned quantity includes protected copies and copies with user tags', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator)]));
    const longAgo = new Date(0).toISOString();
    await seedCollectionEntries(user, [
      { card_printing_id: angelicCurator, latest_addition_at: longAgo, quantity: 2, is_protected: true },
      { card_printing_id: angelicCurator, latest_addition_at: longAgo, quantity: 5, user_tag_ids: [crypto.randomUUID()] },
    ]);

    const { items } = await collectionPrintings(user);

    expect(items.map((row) => [row.printing_id, row.owned_quantity])).toEqual([[angelicCurator, 8]]);
  });

  test('the newest addition comes first', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator)]));
    await committed(user, scanBatch([stack(delverInnistrad)]));
    await committed(user, scanBatch([stack(ribbonsOfNight)]));
    await committed(user, scanBatch([stack(angelicCurator, { finish: 'foil' })]));

    const { items } = await collectionPrintings(user);

    expect(printingIds(items)).toEqual([angelicCurator, ribbonsOfNight, delverInnistrad]);
  });

  test('card printings added at the same time sort by name, then by card printing ID', async () => {
    const user = await signUpNewUser();
    const addedAt = '2026-10-18T09:00:00.000Z';
    const sameName = catalog.filter((printing) => printing.name === catalogPrinting(delverInnistrad).name);
    expect(sameName.length).toBeGreaterThan(1);
    const byName = [catalogPrinting(angelicCurator), ...sameName, catalogPrinting(ribbonsOfNight)];
    await seedCollectionEntries(
      user,
      [...byName].reverse().map((printing) => ({ card_printing_id: printing.printing_id, latest_addition_at: addedAt })),
    );

    const { items } = await collectionPrintings(user);

    expect(printingIds(items)).toEqual([
      angelicCurator,
      ...sameName.map((printing) => printing.printing_id).sort(),
      ribbonsOfNight,
    ]);
  });
});

describe('binder grid pages', () => {
  const seededCount = 130;
  let user: TestUser;
  let seeded: string[];

  beforeAll(async () => {
    user = await signUpNewUser();
    seeded = catalog.slice(0, seededCount).map((printing) => printing.printing_id);
    const start = Date.parse('2026-10-18T09:00:00.000Z');
    await seedCollectionEntries(
      user,
      seeded.map((printingId, index) => ({
        card_printing_id: printingId,
        latest_addition_at: new Date(start + Math.floor(index / 2) * 1000).toISOString(),
      })),
    );
  });

  test('the first page holds 60 card printings', async () => {
    const { items, next_cursor } = await collectionPrintings(user);

    expect(items.length).toBe(60);
    expect(next_cursor).toEqual(expect.any(String));
  });

  test('pages of 1 cover every card printing once, newest addition first', async () => {
    const { rows } = await allCollectionPrintings(user, 1);

    expect([...printingIds(rows)].sort()).toEqual([...seeded].sort());
    const times = rows.map((row) => new Date(row.latest_addition_at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));
  });

  test.each([
    [60, [60, 60, 10]],
    [120, [120, 10]],
  ])('pages of %p cover every card printing once, in the same order', async (limit, pageSizes) => {
    const reference = printingIds((await allCollectionPrintings(user, 1)).rows);

    const { rows, sizes } = await allCollectionPrintings(user, limit);

    expect(printingIds(rows)).toEqual(reference);
    expect(sizes).toEqual(pageSizes);
  });

  test.each<[string, Record<string, unknown> | unknown[], string | null]>([
    ['a query that is not an object', [], null],
    ['a limit of 0', { limit: 0 }, 'limit'],
    ['a limit of 121', { limit: 121 }, 'limit'],
    ['a limit that is not a number', { limit: '60' }, 'limit'],
    ['a cursor that is not a string', { cursor: 7 }, 'cursor'],
    ['an unknown field', { owned_only: true }, 'owned_only'],
  ])('%s is refused with invalid_argument', async (_, query, field) => {
    const { page, error } = await listCollectionPrintings(user.client, query);

    expect(page).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
  });

  test('a malformed cursor is refused with invalid_cursor', async () => {
    const { error } = await listCollectionPrintings(user.client, { cursor: 'not a cursor' });

    expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
  });

  test('a cursor with a broken sort key is refused with invalid_cursor', async () => {
    const { next_cursor } = await collectionPrintings(user, { limit: 1 });
    const payload = JSON.parse(Buffer.from(next_cursor!, 'base64').toString('utf8'));
    const broken = Buffer.from(JSON.stringify({ ...payload, after: ['someday', 1, 'x'] })).toString('base64');

    const { error } = await listCollectionPrintings(user.client, { limit: 1, cursor: broken });

    expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
  });

  test("another user's cursor is refused with invalid_cursor", async () => {
    await committed(bob, scanBatch([stack(angelicCurator), stack(delverInnistrad)]));
    const { next_cursor } = await collectionPrintings(bob, { limit: 1 });

    const { error } = await listCollectionPrintings(user.client, { limit: 1, cursor: next_cursor });

    expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
  });
});

describe('access', () => {
  beforeAll(async () => {
    await committed(alice, scanBatch([stack(ribbonsOfNight, { copies: 2 })]));
  });

  test("a user never reads another user's card printings", async () => {
    const stranger = await signUpNewUser();

    expect(printingIds((await collectionPrintings(alice)).items)).toEqual([ribbonsOfNight]);
    expect(await collectionPrintings(stranger)).toEqual({ items: [], next_cursor: null });
  });

  test('an anonymous caller cannot read the binder grid', async () => {
    const { data, error } = await anonymousClient().rpc('list_collection_printings', { query: {} });

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });

  test('the secret key cannot read the binder grid', async () => {
    const { data, error } = await secretKeyClient().rpc('list_collection_printings', { query: {} });

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });
});

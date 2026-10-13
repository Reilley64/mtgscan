import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { type CollectionCopiesPage, type CollectionCopiesQuery, type CollectionCopyRow } from '../collection';
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

type CatalogPrinting = Pick<CollectionCopyRow, 'printing_id' | 'name' | 'set' | 'collector_number' | 'image_uris'>;

type CopyKey = [entryId: string, copyNumber: number];

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

async function listCollectionCopies(
  client: AppClient,
  query: CollectionCopiesQuery | Record<string, unknown> | unknown[] = {},
) {
  const { data, error } = await client.rpc('list_collection_copies', { query: query as Json });
  return { page: data as unknown as CollectionCopiesPage | null, error: error && readSearchError(error) };
}

async function collectionCopies(user: TestUser, query: CollectionCopiesQuery = {}) {
  const { page, error } = await listCollectionCopies(user.client, query);
  expect(error).toBeNull();
  return page!;
}

async function allCollectionCopies(user: TestUser, limit: number) {
  const rows: CollectionCopyRow[] = [];
  const sizes: number[] = [];
  let cursor: string | null = null;
  do {
    const page = await collectionCopies(user, { limit, cursor });
    rows.push(...page.items);
    sizes.push(page.items.length);
    cursor = page.next_cursor;
  } while (cursor);
  return { rows, sizes };
}

function printingIds(rows: CollectionCopyRow[]) {
  return rows.map((row) => row.printing_id);
}

function copyKeys(rows: CollectionCopyRow[]): CopyKey[] {
  return rows.map((row) => [row.collection_entry_id, row.copy_number]);
}

function byCopyKey(a: Pick<CollectionCopyRow, 'collection_entry_id' | 'copy_number'>, b: typeof a) {
  if (a.collection_entry_id !== b.collection_entry_id) {
    return a.collection_entry_id < b.collection_entry_id ? -1 : 1;
  }
  return a.copy_number - b.copy_number;
}

function entryId(result: Awaited<ReturnType<typeof committed>>, finish = 'nonfoil') {
  return result.items.find((item) => item.finish === finish)!.collection_entry_id!;
}

describe('the binder grid read', () => {
  test('a user with no collection entries gets an empty page', async () => {
    const user = await signUpNewUser();

    expect(await collectionCopies(user)).toEqual({ items: [], next_cursor: null });
  });

  test('each collection entry is one row per copy, with its card printing, finish, condition, language, and protected flag', async () => {
    const user = await signUpNewUser();
    const added = await committed(
      user,
      scanBatch([
        stack(angelicCurator, { copies: 2 }),
        stack(angelicCurator, { finish: 'foil', condition: 'lightly_played', language: 'ja' }),
      ]),
    );
    const [protectedEntry] = await seedCollectionEntries(user, [
      { card_printing_id: angelicCurator, latest_addition_at: new Date(0).toISOString(), quantity: 2, is_protected: true },
    ]);
    const copy = (collectionEntryId: string, copyNumber: number, changes: Partial<CollectionCopyRow> = {}): CollectionCopyRow => ({
      collection_entry_id: collectionEntryId,
      copy_number: copyNumber,
      ...catalogPrinting(angelicCurator),
      finish: 'nonfoil',
      condition: 'near_mint',
      language: 'en',
      protected: false,
      ...changes,
    });
    const foil = { finish: 'foil', condition: 'lightly_played', language: 'ja' } as const;
    const expected = [
      copy(entryId(added), 1),
      copy(entryId(added), 2),
      copy(entryId(added, 'foil'), 1, foil),
      copy(protectedEntry!, 1, { protected: true }),
      copy(protectedEntry!, 2, { protected: true }),
    ];

    const { items, next_cursor } = await collectionCopies(user);

    expect(next_cursor).toBeNull();
    expect(items).toEqual(expected.sort(byCopyKey));
  });

  test('a copy keeps its copy key when more copies merge into its collection entry', async () => {
    const user = await signUpNewUser();
    const first = await committed(user, scanBatch([stack(angelicCurator, { copies: 2 })]));
    const before = copyKeys((await collectionCopies(user)).items);

    await committed(user, scanBatch([stack(angelicCurator)]));

    expect(before).toEqual([
      [entryId(first), 1],
      [entryId(first), 2],
    ]);
    expect(copyKeys((await collectionCopies(user)).items)).toEqual([...before, [entryId(first), 3]]);
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

  test('card printings added at the same time sort by name, then by card printing ID', async () => {
    const user = await signUpNewUser();
    const addedAt = '2026-10-18T09:00:00.000Z';
    const sameName = catalog.filter((printing) => printing.name === catalogPrinting(delverInnistrad).name);
    expect(sameName.length).toBeGreaterThan(1);
    const byName = [catalogPrinting(angelicCurator), ...sameName, catalogPrinting(ribbonsOfNight)];
    await seedCollectionEntries(
      user,
      [...byName].reverse().map((printing) => ({
        card_printing_id: printing.printing_id,
        latest_addition_at: addedAt,
        quantity: 2,
      })),
    );

    const { items } = await collectionCopies(user);

    expect(printingIds(items)).toEqual(
      [angelicCurator, ...sameName.map((printing) => printing.printing_id).sort(), ribbonsOfNight].flatMap((id) => [id, id]),
    );
  });
});

describe('binder grid pages', () => {
  const seededEntries = 50;
  const seededCopies = 123;
  let user: TestUser;
  let seeded: CopyKey[];

  beforeAll(async () => {
    user = await signUpNewUser();
    const start = Date.parse('2026-10-18T09:00:00.000Z');
    const entries = catalog.slice(0, seededEntries).map((printing, index) => ({
      card_printing_id: printing.printing_id,
      latest_addition_at: new Date(start + Math.floor(index / 2) * 1000).toISOString(),
      quantity: (index % 4) + 1,
    }));
    const ids = await seedCollectionEntries(user, entries);
    seeded = ids.flatMap((id, index) =>
      Array.from({ length: entries[index]!.quantity }, (_, copy): CopyKey => [id, copy + 1]),
    );
  });

  test('the first page holds 60 copies', async () => {
    const { items, next_cursor } = await collectionCopies(user);

    expect(items.length).toBe(60);
    expect(next_cursor).toEqual(expect.any(String));
  });

  test('pages of 1 cover every copy once', async () => {
    const { rows } = await allCollectionCopies(user, 1);

    expect(rows.length).toBe(seededCopies);
    expect([...copyKeys(rows)].sort()).toEqual([...seeded].sort());
  });

  test.each([
    [60, [60, 60, 3]],
    [120, [120, 3]],
  ])('pages of %p cover every copy once, in the same order', async (limit, pageSizes) => {
    const reference = copyKeys((await allCollectionCopies(user, 1)).rows);

    const { rows, sizes } = await allCollectionCopies(user, limit);

    expect(copyKeys(rows)).toEqual(reference);
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
    const { page, error } = await listCollectionCopies(user.client, query);

    expect(page).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
  });

  test('a malformed cursor is refused with invalid_cursor', async () => {
    const { error } = await listCollectionCopies(user.client, { cursor: 'not a cursor' });

    expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
  });

  test('a cursor with a broken copy key is refused with invalid_cursor', async () => {
    const { next_cursor } = await collectionCopies(user, { limit: 1 });
    const payload = JSON.parse(Buffer.from(next_cursor!, 'base64').toString('utf8'));
    const broken = Buffer.from(
      JSON.stringify({ ...payload, after: [...payload.after.slice(0, 4), 'first'] }),
    ).toString('base64');

    const { error } = await listCollectionCopies(user.client, { limit: 1, cursor: broken });

    expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
  });

  test("another user's cursor is refused with invalid_cursor", async () => {
    await committed(bob, scanBatch([stack(angelicCurator, { copies: 2 })]));
    const { next_cursor } = await collectionCopies(bob, { limit: 1 });

    const { error } = await listCollectionCopies(user.client, { limit: 1, cursor: next_cursor });

    expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
  });
});

describe('access', () => {
  beforeAll(async () => {
    await committed(alice, scanBatch([stack(ribbonsOfNight, { copies: 2 })]));
  });

  test("a user never reads another user's copies", async () => {
    const stranger = await signUpNewUser();

    expect(printingIds((await collectionCopies(alice)).items)).toEqual([ribbonsOfNight, ribbonsOfNight]);
    expect(await collectionCopies(stranger)).toEqual({ items: [], next_cursor: null });
  });

  test('an anonymous caller cannot read the binder grid', async () => {
    const { data, error } = await anonymousClient().rpc('list_collection_copies', { query: {} });

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });

  test('the secret key cannot read the binder grid', async () => {
    const { data, error } = await secretKeyClient().rpc('list_collection_copies', { query: {} });

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });
});

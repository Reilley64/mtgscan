import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { type CardCondition, type CardLanguage } from '../collection';
import type { Json } from '../database.types';
import type { Finish } from '../search';
import {
  basicLands,
  catalogFixture,
  resetCardCatalog,
  runCatalogImport,
  runPriceImport,
  withBasicLands,
} from './catalog-import-command';
import { seedCollectionEntries } from './collection-entry-seeds';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { addScanBatch, committed, copyIds, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const checkViolation = '23514';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const ribbonsOfNight = '010eba83-30ec-4cca-b07e-f24d8d2f0787';
const strongholdRatsWithoutPrice = '86cdaa71-b605-42f8-97e2-1a2569840f57';
const unknownPrinting = '00000000-0000-4000-8000-000000000000';

const [forest, wastes, snowCoveredForest] = basicLands.map((land) => land.id) as [string, string, string];

type EntryRow = {
  card_printing_id: string;
  finish: Finish;
  condition: CardCondition;
  language: CardLanguage;
  is_protected: boolean;
  user_tag_ids: string[];
  quantity: number;
};

function entryRow(cardPrintingId: string, quantity: number, changes: Partial<EntryRow> = {}): EntryRow {
  return {
    card_printing_id: cardPrintingId,
    finish: 'nonfoil',
    condition: 'near_mint',
    language: 'en',
    is_protected: false,
    user_tag_ids: [],
    quantity,
    ...changes,
  };
}

function entryLine(cardPrintingId: string) {
  const { card_printing_id, finish, condition, language } = entryRow(cardPrintingId, 1);
  return { card_printing_id, finish, condition, language };
}

async function entriesOf(user: { client: AppClient }) {
  const { data, error } = await user.client
    .from('collection_entries')
    .select('card_printing_id, finish, condition, language, is_protected, user_tag_ids, quantity')
    .order('card_printing_id')
    .order('finish')
    .order('condition')
    .order('language')
    .order('is_protected')
    .order('user_tag_ids');
  expect(error).toBeNull();
  return data!;
}

async function additionsOf(user: { client: AppClient }) {
  const { data, error } = await user.client.from('collection_additions').select('*').order('added_at');
  expect(error).toBeNull();
  return data!;
}

async function linesOf(user: { client: AppClient }) {
  const { data, error } = await user.client
    .from('collection_addition_lines')
    .select('*')
    .order('card_printing_id')
    .order('finish');
  expect(error).toBeNull();
  return data!;
}

async function collectionOf(user: { client: AppClient }) {
  return { entries: await entriesOf(user), additions: await additionsOf(user), lines: await linesOf(user) };
}

async function pricesSnapshotAt() {
  const { data, error } = await secretKeyClient()
    .from('import_snapshots')
    .select('snapshot_at')
    .eq('source', 'prices')
    .single();
  expect(error).toBeNull();
  return new Date(data!.snapshot_at).getTime();
}

let alice: TestUser;
let bob: TestUser;
let manifest: string;

beforeAll(async () => {
  [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
  await resetCardCatalog();
  manifest = await catalogFixture({ oracleCards: withBasicLands, defaultCards: withBasicLands });
  expect((await runCatalogImport(manifest)).exitCode).toBe(0);
  expect((await runPriceImport(manifest)).exitCode).toBe(0);
});

describe('committing a scan batch', () => {
  test('a commit creates collection entries for the scanned copies', async () => {
    const user = await signUpNewUser();

    const batch = scanBatch([stack(angelicCurator, { copies: 2 })]);

    const result = await committed(user, batch);

    expect(await entriesOf(user)).toEqual([entryRow(angelicCurator, 2)]);
    const [entry] = (await user.client.from('collection_entries').select('id')).data!;
    const [firstCopy, secondCopy] = batch.items[0]!.copy_ids;
    expect(result).toEqual({
      addition_id: expect.any(String),
      added_at: expect.any(String),
      copy_count: 2,
      copies: [firstCopy, secondCopy].map((copyId) => ({
        copy_id: copyId,
        addition_id: result.addition_id!,
        collection_entry_id: entry!.id,
        replayed: false,
      })),
      items: [
        {
          card_printing_id: angelicCurator,
          finish: 'nonfoil',
          condition: 'near_mint',
          language: 'en',
          collection_entry_id: entry!.id,
          quantity_added: 2,
          entry_quantity: 2,
        },
      ],
    });
  });

  test('a second commit of identical copies merges into the same collection entry', async () => {
    const user = await signUpNewUser();
    const first = await committed(user, scanBatch([stack(angelicCurator, { copies: 2 })]));

    const second = await committed(user, scanBatch([stack(angelicCurator, { copies: 3 })]));

    expect(await entriesOf(user)).toEqual([entryRow(angelicCurator, 5)]);
    expect(second.items[0]!.collection_entry_id).toBe(first.items[0]!.collection_entry_id!);
    expect(second.items[0]!.quantity_added).toBe(3);
    expect(second.items[0]!.entry_quantity).toBe(5);
  });

  test('copies that differ in card printing, finish, condition, or language make separate collection entries', async () => {
    const user = await signUpNewUser();

    await committed(
      user,
      scanBatch([
        stack(angelicCurator),
        stack(angelicCurator, { finish: 'foil' }),
        stack(angelicCurator, { condition: 'lightly_played' }),
        stack(angelicCurator, { language: 'ja' }),
        stack(delverInnistrad),
      ]),
    );

    expect(await entriesOf(user)).toEqual([
      entryRow(delverInnistrad, 1),
      entryRow(angelicCurator, 1),
      entryRow(angelicCurator, 1, { language: 'ja' }),
      entryRow(angelicCurator, 1, { condition: 'lightly_played' }),
      entryRow(angelicCurator, 1, { finish: 'foil' }),
    ]);
  });

  test('scanned copies never merge into a protected collection entry or one with user tags', async () => {
    const user = await signUpNewUser();
    const userTag = crypto.randomUUID();
    await seedCollectionEntries(user, [
      entryRow(angelicCurator, 4, { is_protected: true }),
      entryRow(angelicCurator, 6, { user_tag_ids: [userTag] }),
    ]);

    await committed(user, scanBatch([stack(angelicCurator, { copies: 2 })]));

    expect(await entriesOf(user)).toEqual([
      entryRow(angelicCurator, 2),
      entryRow(angelicCurator, 6, { user_tag_ids: [userTag] }),
      entryRow(angelicCurator, 4, { is_protected: true }),
    ]);
  });

  test('stacks with the same properties in one commit are summed', async () => {
    const user = await signUpNewUser();

    const result = await committed(
      user,
      scanBatch([
        stack(angelicCurator, { copies: 2 }),
        stack(delverInnistrad),
        stack(angelicCurator, { copies: 3 }),
      ]),
    );

    expect(await entriesOf(user)).toEqual([entryRow(delverInnistrad, 1), entryRow(angelicCurator, 5)]);
    expect(result.copy_count).toBe(6);
    expect(result.items.map((item) => [item.card_printing_id, item.quantity_added])).toEqual([
      [delverInnistrad, 1],
      [angelicCurator, 5],
    ]);
  });
});

describe('the user tag set', () => {
  const [firstTag, secondTag] = [crypto.randomUUID(), crypto.randomUUID()].sort() as [string, string];

  test('a collection entry keeps a sorted set of distinct user tags', async () => {
    const user = await signUpNewUser();

    await seedCollectionEntries(user, [entryRow(angelicCurator, 1, { user_tag_ids: [firstTag, secondTag] })]);

    expect(await entriesOf(user)).toEqual([entryRow(angelicCurator, 1, { user_tag_ids: [firstTag, secondTag] })]);
  });

  test.each([
    ['unsorted', [secondTag, firstTag]],
    ['repeated', [firstTag, firstTag]],
  ])('a user tag set with %s user tags is refused', async (_, userTagIds) => {
    const user = await signUpNewUser();

    const { error } = await secretKeyClient()
      .from('collection_entries')
      .insert({
        ...entryRow(angelicCurator, 1, { user_tag_ids: userTagIds }),
        user_id: user.userId,
        latest_addition_at: new Date().toISOString(),
      });

    expect(error?.code).toBe(checkViolation);
  });
});

describe('additions', () => {
  test('each commit records one addition with its time and copy count', async () => {
    const user = await signUpNewUser();

    const first = await committed(user, scanBatch([stack(angelicCurator, { copies: 2 }), stack(delverInnistrad)]));
    const second = await committed(user, scanBatch([stack(delverInnistrad, { finish: 'foil' })]));

    expect(await additionsOf(user)).toEqual([
      {
        id: first.addition_id!,
        user_id: user.userId,
        added_at: expect.any(String),
        copy_count: 3,
        source: 'scan_batch',
      },
      {
        id: second.addition_id!,
        user_id: user.userId,
        added_at: expect.any(String),
        copy_count: 1,
        source: 'scan_batch',
      },
    ]);
    const added = (await additionsOf(user)).map((addition) => new Date(addition.added_at).getTime());
    expect(added).toEqual([new Date(first.added_at!).getTime(), new Date(second.added_at!).getTime()]);
    expect(Math.abs(Date.now() - added[1]!)).toBeLessThan(60_000);
  });

  test('each stack records its purchase-day price in USD and EUR with the price snapshot time', async () => {
    const user = await signUpNewUser();

    const result = await committed(
      user,
      scanBatch([
        stack(angelicCurator),
        stack(angelicCurator, { finish: 'foil' }),
        stack(angelicCurator, { finish: 'etched', copies: 2 }),
        stack(strongholdRatsWithoutPrice),
      ]),
    );

    const snapshotAt = await pricesSnapshotAt();
    const lines = (await linesOf(user)).map((line) => ({
      card_printing_id: line.card_printing_id,
      finish: line.finish,
      quantity: line.quantity,
      purchase_day_usd_cents: line.purchase_day_usd_cents,
      purchase_day_eur_cents: line.purchase_day_eur_cents,
      price_snapshot_at: line.price_snapshot_at && new Date(line.price_snapshot_at).getTime(),
      addition_id: line.addition_id,
    }));
    const line = (
      cardPrintingId: string,
      finish: Finish,
      quantity: number,
      usd: number | null,
      eur: number | null,
    ) => ({
      card_printing_id: cardPrintingId,
      finish,
      quantity,
      purchase_day_usd_cents: usd,
      purchase_day_eur_cents: eur,
      price_snapshot_at: snapshotAt,
      addition_id: result.addition_id!,
    });
    expect(lines).toEqual([
      line(angelicCurator, 'nonfoil', 1, 21, 4),
      line(angelicCurator, 'foil', 1, 30, 24),
      line(angelicCurator, 'etched', 2, 44, null),
      line(strongholdRatsWithoutPrice, 'nonfoil', 1, null, null),
    ]);
  });

  test('each addition line points at the collection entry it merged into', async () => {
    const user = await signUpNewUser();

    const result = await committed(user, scanBatch([stack(angelicCurator), stack(delverInnistrad, { copies: 2 })]));

    const lines = await linesOf(user);
    expect(lines.map((line) => [line.card_printing_id, line.collection_entry_id, line.entry_quantity])).toEqual(
      result.items.map((item) => [item.card_printing_id, item.collection_entry_id, item.entry_quantity]),
    );
  });

  test('each touched collection entry gets the commit time as its latest addition time', async () => {
    const user = await signUpNewUser();
    const first = await committed(user, scanBatch([stack(angelicCurator), stack(delverInnistrad)]));

    const second = await committed(user, scanBatch([stack(delverInnistrad)]));

    const { data } = await user.client
      .from('collection_entries')
      .select('card_printing_id, latest_addition_at, created_at');
    const latest = Object.fromEntries(
      data!.map((entry) => [entry.card_printing_id, new Date(entry.latest_addition_at).getTime()]),
    );
    expect(latest).toEqual({
      [angelicCurator]: new Date(first.added_at!).getTime(),
      [delverInnistrad]: new Date(second.added_at!).getTime(),
    });
    expect(new Date(second.added_at!).getTime()).toBeGreaterThan(new Date(first.added_at!).getTime());
  });
});

describe('refused scan batches', () => {
  test.each([
    ['a basic land', forest],
    ['Wastes', wastes],
    ['a snow-covered basic land', snowCoveredForest],
  ])('%s is refused with basic_land and the field of its stack', async (_, basicLand) => {
    const user = await signUpNewUser();

    const { result, error } = await addScanBatch(user, scanBatch([stack(angelicCurator), stack(basicLand)]));

    expect(result).toBeNull();
    expect(error).toMatchObject({ code: 'basic_land', field: 'items[1].card_printing_id' });
    expect(await entriesOf(user)).toEqual([]);
    expect(await additionsOf(user)).toEqual([]);
  });

  test('an unknown card printing is refused with unknown_printing', async () => {
    const user = await signUpNewUser();

    const { error } = await addScanBatch(user, scanBatch([stack(unknownPrinting)]));

    expect(error).toMatchObject({ code: 'unknown_printing', field: 'items[0].card_printing_id' });
  });

  const tooManyItems = Array.from({ length: 2001 }, () => stack(angelicCurator));
  const repeatedCopyId = crypto.randomUUID();
  const invalidBatches: [string, unknown, string | null][] = [
    ['a batch that is not an object', [], null],
    ['missing items', {}, 'items'],
    ['an unknown field', { ...scanBatch([stack(angelicCurator)]), idempotency_key: crypto.randomUUID() }, 'idempotency_key'],
    ['no items', scanBatch([]), 'items'],
    ['2,001 items', scanBatch(tooManyItems), 'items'],
    ['items that are not a list', { items: stack(angelicCurator) }, 'items'],
    ['a stack that is not an object', scanBatch([stack(angelicCurator), 'Angelic Curator']), 'items[1]'],
    ['an unknown stack field', scanBatch([{ ...stack(angelicCurator), quantity: 1 }]), 'items[0].quantity'],
    [
      'a missing card printing',
      scanBatch([{ ...stack(angelicCurator), card_printing_id: undefined }]),
      'items[0].card_printing_id',
    ],
    ['a card printing that is not a UUID', scanBatch([stack('angelic-curator')]), 'items[0].card_printing_id'],
    ['a missing finish', scanBatch([{ ...stack(angelicCurator), finish: undefined }]), 'items[0].finish'],
    ['an unknown finish', scanBatch([stack(angelicCurator, { finish: 'gilded' as Finish })]), 'items[0].finish'],
    [
      'a finish the card printing does not have',
      scanBatch([stack(angelicCurator), stack(ribbonsOfNight, { finish: 'foil' })]),
      'items[1].finish',
    ],
    ['a missing condition', scanBatch([{ ...stack(angelicCurator), condition: undefined }]), 'items[0].condition'],
    [
      'an unknown condition',
      scanBatch([stack(angelicCurator, { condition: 'mint' as CardCondition })]),
      'items[0].condition',
    ],
    ['a missing language', scanBatch([{ ...stack(angelicCurator), language: undefined }]), 'items[0].language'],
    [
      'an unknown language',
      scanBatch([stack(angelicCurator, { language: 'la' as CardLanguage })]),
      'items[0].language',
    ],
    ['missing copy IDs', scanBatch([{ ...stack(angelicCurator), copy_ids: undefined }]), 'items[0].copy_ids'],
    ['no copy IDs', scanBatch([{ ...stack(angelicCurator), copy_ids: [] }]), 'items[0].copy_ids'],
    ['1,000 copy IDs in a stack', scanBatch([stack(angelicCurator, { copies: 1000 })]), 'items[0].copy_ids'],
    [
      'copy IDs that are not a list',
      scanBatch([{ ...stack(angelicCurator), copy_ids: crypto.randomUUID() }]),
      'items[0].copy_ids',
    ],
    [
      'a copy ID that is not a UUID',
      scanBatch([{ ...stack(angelicCurator), copy_ids: [crypto.randomUUID(), 'copy-2'] }]),
      'items[0].copy_ids[1]',
    ],
    [
      'a copy ID repeated in the batch',
      scanBatch([
        { ...stack(angelicCurator), copy_ids: [repeatedCopyId] },
        { ...stack(delverInnistrad), copy_ids: [crypto.randomUUID(), repeatedCopyId] },
      ]),
      'items[1].copy_ids[1]',
    ],
    [
      'more than 10,000 copy IDs',
      scanBatch([...Array.from({ length: 10 }, () => stack(angelicCurator, { copies: 999 })), stack(angelicCurator, { copies: 11 })]),
      'items',
    ],
  ];
  test.each(invalidBatches)('%s is refused with invalid_argument', async (_, batch, field) => {
    const user = await signUpNewUser();

    const { result, error } = await addScanBatch(user, batch as Record<string, unknown>);

    expect(result).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
    expect(await entriesOf(user)).toEqual([]);
  });

  test('2,000 stacks and 10,000 copy IDs are accepted', async () => {
    const user = await signUpNewUser();
    const stacks = [
      ...Array.from({ length: 1990 }, () => stack(angelicCurator)),
      ...Array.from({ length: 10 }, () => stack(angelicCurator, { copies: 801 })),
    ];

    const result = await committed(user, scanBatch(stacks));

    expect(result.copy_count).toBe(10_000);
    expect(await entriesOf(user)).toEqual([entryRow(angelicCurator, 10_000)]);
  });

  test('a refused commit writes nothing, even when earlier stacks were valid', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator)]));
    const before = await collectionOf(user);

    const { error } = await addScanBatch(
      user,
      scanBatch([stack(angelicCurator, { copies: 3 }), stack(delverInnistrad), stack(unknownPrinting)]),
    );

    expect(error?.code).toBe('unknown_printing');
    expect(await collectionOf(user)).toEqual(before);
  });
});

describe('copy IDs', () => {
  test('a repeated copy ID adds nothing and returns the addition that added it', async () => {
    const user = await signUpNewUser();
    const batch = scanBatch([stack(angelicCurator, { copies: 2 }), stack(delverInnistrad)]);
    const first = await committed(user, batch);
    await committed(user, scanBatch([stack(angelicCurator)]));
    const before = await collectionOf(user);

    const replay = await committed(user, { items: [...batch.items].reverse() });

    expect(replay.addition_id).toBeNull();
    expect(replay.copy_count).toBe(0);
    expect(replay.items).toEqual([]);
    expect(replay.copies).toEqual(
      [batch.items[1]!.copy_ids, batch.items[0]!.copy_ids].flat().map((copyId) => ({
        ...first.copies.find((copy) => copy.copy_id === copyId)!,
        replayed: true,
      })),
    );
    expect(await collectionOf(user)).toEqual(before);
  });

  test('a changed batch that repeats some copy IDs adds only the new copies', async () => {
    const user = await signUpNewUser();
    const added = stack(angelicCurator, { copies: 2 });
    const first = await committed(user, scanBatch([added]));
    const edited = { ...added, condition: 'lightly_played' as const, copy_ids: [added.copy_ids[0]!] };
    const newCopies = stack(delverInnistrad, { copies: 3 });

    const second = await committed(user, scanBatch([edited, newCopies]));

    expect(await entriesOf(user)).toEqual([entryRow(delverInnistrad, 3), entryRow(angelicCurator, 2)]);
    expect(second.copy_count).toBe(3);
    expect(second.items.map((item) => [item.card_printing_id, item.quantity_added])).toEqual([[delverInnistrad, 3]]);
    expect(second.copies.map((copy) => [copy.addition_id, copy.replayed])).toEqual([
      [first.addition_id!, true],
      [second.addition_id!, false],
      [second.addition_id!, false],
      [second.addition_id!, false],
    ]);
    expect((await additionsOf(user)).map((addition) => addition.copy_count)).toEqual([2, 3]);
  });

  test('copy IDs belong to one user, so the same copy IDs add copies for another user', async () => {
    const copies = copyIds(2);
    const forAlice = await committed(alice, scanBatch([{ ...stack(angelicCurator), copy_ids: copies }]));

    const forBob = await committed(bob, scanBatch([{ ...stack(delverInnistrad), copy_ids: copies }]));

    expect(forBob.copy_count).toBe(2);
    expect(forBob.addition_id).not.toBe(forAlice.addition_id);
    expect(forBob.copies.map((copy) => copy.replayed)).toEqual([false, false]);
    expect(await entriesOf(bob)).toContainEqual(entryRow(delverInnistrad, 2));
  });

  test('each added copy is recorded with its addition line', async () => {
    const user = await signUpNewUser();
    const batch = scanBatch([stack(angelicCurator, { copies: 2 }), stack(delverInnistrad, { finish: 'foil' })]);

    const result = await committed(user, batch);

    const { data, error } = await user.client
      .from('collection_addition_copies')
      .select('copy_id, addition_id, card_printing_id, finish, condition, language');
    expect(error).toBeNull();
    expect(data!.toSorted((a, b) => a.copy_id.localeCompare(b.copy_id))).toEqual(
      batch.items
        .flatMap((item) =>
          item.copy_ids.map((copyId) => ({
            copy_id: copyId,
            addition_id: result.addition_id!,
            card_printing_id: item.card_printing_id,
            finish: item.finish,
            condition: item.condition,
            language: item.language,
          })),
        )
        .toSorted((a, b) => a.copy_id.localeCompare(b.copy_id)),
    );
  });
});

test('concurrent commits with different copies end with the summed quantity in one collection entry', async () => {
  const user = await signUpNewUser();

  const results = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      addScanBatch(user, scanBatch([stack(angelicCurator, { copies: index + 1 })])),
    ),
  );

  expect(results.map(({ error }) => error)).toEqual([null, null, null, null]);
  expect(await entriesOf(user)).toEqual([entryRow(angelicCurator, 10)]);
  expect((await additionsOf(user)).length).toBe(4);
});

test('concurrent commits of the same copy IDs add the copies once', async () => {
  const user = await signUpNewUser();
  const batch = scanBatch([stack(angelicCurator, { copies: 2 })]);

  const results = await Promise.all(Array.from({ length: 3 }, () => committed(user, batch)));

  expect(results.filter((result) => result.copy_count > 0).length).toBe(1);
  expect(await entriesOf(user)).toEqual([entryRow(angelicCurator, 2)]);
});

describe('access', () => {
  beforeAll(async () => {
    await committed(alice, scanBatch([stack(angelicCurator, { copies: 2 })]));
  });

  test("a user never reads another user's collection entries, additions, or addition lines", async () => {
    expect((await entriesOf(alice)).length).toBeGreaterThan(0);
    expect((await additionsOf(alice)).length).toBeGreaterThan(0);
    expect((await linesOf(alice)).length).toBeGreaterThan(0);
    for (const table of [
      'collection_entries',
      'collection_additions',
      'collection_addition_lines',
      'collection_addition_copies',
    ] as const) {
      const { data, error } = await bob.client.from(table).select('user_id').eq('user_id', alice.userId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  test('an anonymous caller reads nothing and cannot commit a scan batch', async () => {
    const anonymous = anonymousClient();
    for (const table of [
      'collection_entries',
      'collection_additions',
      'collection_addition_lines',
      'collection_addition_copies',
    ] as const) {
      const { data } = await anonymous.from(table).select('user_id');
      expect(data ?? []).toEqual([]);
    }

    const { error } = await anonymous.rpc('add_scan_batch', { batch: scanBatch([stack(angelicCurator)]) as Json });

    expect(error?.code).toBe(permissionDenied);
  });

  test('the secret key cannot commit a scan batch', async () => {
    const { error } = await secretKeyClient().rpc('add_scan_batch', {
      batch: scanBatch([stack(angelicCurator)]) as Json,
    });

    expect(error?.code).toBe(permissionDenied);
  });

  describe.each([
    ['a signed-in user', () => alice.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('direct writes by %s are refused', (_, client) => {
    test('inserting, updating, and deleting collection entries is refused', async () => {
      const entries = () => client().from('collection_entries');
      const row = {
        ...entryRow(angelicCurator, 1),
        user_id: alice.userId,
        latest_addition_at: new Date().toISOString(),
      };

      expect((await entries().insert(row)).error?.code).toBe(permissionDenied);
      expect((await entries().update({ quantity: 99 }).eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
      expect((await entries().delete().eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
    });

    test('inserting, updating, and deleting additions is refused', async () => {
      const additions = () => client().from('collection_additions');
      const row = {
        user_id: alice.userId,
        added_at: new Date().toISOString(),
        copy_count: 1,
        source: 'scan_batch' as const,
      };

      expect((await additions().insert(row)).error?.code).toBe(permissionDenied);
      expect((await additions().update({ copy_count: 99 }).eq('user_id', alice.userId)).error?.code).toBe(
        permissionDenied,
      );
      expect((await additions().delete().eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
    });

    test('inserting, updating, and deleting addition lines is refused', async () => {
      const lines = () => client().from('collection_addition_lines');
      const [addition] = await additionsOf(alice);
      const row = {
        ...entryLine(delverInnistrad),
        addition_id: addition!.id,
        user_id: alice.userId,
        quantity: 1,
        entry_quantity: 1,
      };

      expect((await lines().insert(row)).error?.code).toBe(permissionDenied);
      expect((await lines().update({ quantity: 99 }).eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
      expect((await lines().delete().eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
    });

    test('inserting, updating, and deleting addition copies is refused', async () => {
      const copies = () => client().from('collection_addition_copies');
      const [addition] = await additionsOf(alice);
      const row = {
        ...entryLine(angelicCurator),
        copy_id: crypto.randomUUID(),
        addition_id: addition!.id,
        user_id: alice.userId,
      };

      expect((await copies().insert(row)).error?.code).toBe(permissionDenied);
      expect((await copies().update({ condition: 'damaged' }).eq('user_id', alice.userId)).error?.code).toBe(
        permissionDenied,
      );
      expect((await copies().delete().eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
    });
  });

  test('an import run leaves collection entries and additions unchanged', async () => {
    const before = await collectionOf(alice);

    const later = await catalogFixture({
      oracleCards: withBasicLands,
      defaultCards: withBasicLands,
      updatedAt: '2026-10-22T21:00:00.000+00:00',
    });
    expect((await runCatalogImport(later)).exitCode).toBe(0);
    expect((await runPriceImport(later)).exitCode).toBe(0);

    expect(await collectionOf(alice)).toEqual(before);
  });
});

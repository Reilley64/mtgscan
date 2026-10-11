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
import { addScanBatch, committed, scanBatch, stack } from './scan-batches';

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

    const result = await committed(user, scanBatch([stack(angelicCurator, { quantity: 2 })]));

    expect(await entriesOf(user)).toEqual([entryRow(angelicCurator, 2)]);
    const [entry] = (await user.client.from('collection_entries').select('id')).data!;
    expect(result).toEqual({
      addition_id: expect.any(String),
      added_at: expect.any(String),
      copy_count: 2,
      replayed: false,
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
    const first = await committed(user, scanBatch([stack(angelicCurator, { quantity: 2 })]));

    const second = await committed(user, scanBatch([stack(angelicCurator, { quantity: 3 })]));

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

    await committed(user, scanBatch([stack(angelicCurator, { quantity: 2 })]));

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
        stack(angelicCurator, { quantity: 2 }),
        stack(delverInnistrad),
        stack(angelicCurator, { quantity: 3 }),
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

    const first = await committed(user, scanBatch([stack(angelicCurator, { quantity: 2 }), stack(delverInnistrad)]));
    const second = await committed(user, scanBatch([stack(delverInnistrad, { finish: 'foil' })]));

    expect(await additionsOf(user)).toEqual([
      {
        id: first.addition_id,
        user_id: user.userId,
        added_at: expect.any(String),
        copy_count: 3,
        source: 'scan_batch',
        idempotency_key: expect.any(String),
      },
      {
        id: second.addition_id,
        user_id: user.userId,
        added_at: expect.any(String),
        copy_count: 1,
        source: 'scan_batch',
        idempotency_key: expect.any(String),
      },
    ]);
    const added = (await additionsOf(user)).map((addition) => new Date(addition.added_at).getTime());
    expect(added).toEqual([new Date(first.added_at).getTime(), new Date(second.added_at).getTime()]);
    expect(Math.abs(Date.now() - added[1]!)).toBeLessThan(60_000);
  });

  test('each stack records its purchase-day price in USD and EUR with the price snapshot time', async () => {
    const user = await signUpNewUser();

    const result = await committed(
      user,
      scanBatch([
        stack(angelicCurator),
        stack(angelicCurator, { finish: 'foil' }),
        stack(angelicCurator, { finish: 'etched', quantity: 2 }),
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
      addition_id: result.addition_id,
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

    const result = await committed(user, scanBatch([stack(angelicCurator), stack(delverInnistrad, { quantity: 2 })]));

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
      [angelicCurator]: new Date(first.added_at).getTime(),
      [delverInnistrad]: new Date(second.added_at).getTime(),
    });
    expect(new Date(second.added_at).getTime()).toBeGreaterThan(new Date(first.added_at).getTime());
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
  const invalidBatches: [string, unknown, string | null][] = [
    ['a batch that is not an object', [], null],
    ['a missing idempotency key', { items: [stack(angelicCurator)] }, 'idempotency_key'],
    [
      'an idempotency key that is not a UUID',
      { idempotency_key: 'retry-1', items: [stack(angelicCurator)] },
      'idempotency_key',
    ],
    ['missing items', { idempotency_key: crypto.randomUUID() }, 'items'],
    ['an unknown field', { ...scanBatch([stack(angelicCurator)]), source: 'scan_batch' }, 'source'],
    ['no items', scanBatch([]), 'items'],
    ['2,001 items', scanBatch(tooManyItems), 'items'],
    ['items that are not a list', { idempotency_key: crypto.randomUUID(), items: stack(angelicCurator) }, 'items'],
    ['a stack that is not an object', scanBatch([stack(angelicCurator), 'Angelic Curator']), 'items[1]'],
    ['an unknown stack field', scanBatch([{ ...stack(angelicCurator), is_protected: true }]), 'items[0].is_protected'],
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
    ['a missing quantity', scanBatch([{ ...stack(angelicCurator), quantity: undefined }]), 'items[0].quantity'],
    ['quantity 0', scanBatch([stack(angelicCurator, { quantity: 0 })]), 'items[0].quantity'],
    ['quantity 1,000', scanBatch([stack(angelicCurator, { quantity: 1000 })]), 'items[0].quantity'],
    ['a fractional quantity', scanBatch([stack(angelicCurator, { quantity: 1.5 })]), 'items[0].quantity'],
    [
      'a quantity that is not a number',
      scanBatch([stack(angelicCurator, { quantity: '2' as unknown as number })]),
      'items[0].quantity',
    ],
  ];
  test.each(invalidBatches)('%s is refused with invalid_argument', async (_, batch, field) => {
    const user = await signUpNewUser();

    const { result, error } = await addScanBatch(user, batch as Record<string, unknown>);

    expect(result).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
    expect(await entriesOf(user)).toEqual([]);
  });

  test('2,000 stacks with quantity 999 are accepted', async () => {
    const user = await signUpNewUser();

    const result = await committed(
      user,
      scanBatch(Array.from({ length: 2000 }, () => stack(angelicCurator, { quantity: 999 }))),
    );

    expect(result.copy_count).toBe(1_998_000);
    expect(await entriesOf(user)).toEqual([entryRow(angelicCurator, 1_998_000)]);
  });

  test('a refused commit writes nothing, even when earlier stacks were valid', async () => {
    const user = await signUpNewUser();
    await committed(user, scanBatch([stack(angelicCurator)]));
    const before = await collectionOf(user);

    const { error } = await addScanBatch(
      user,
      scanBatch([stack(angelicCurator, { quantity: 3 }), stack(delverInnistrad), stack(unknownPrinting)]),
    );

    expect(error?.code).toBe('unknown_printing');
    expect(await collectionOf(user)).toEqual(before);
  });
});

describe('idempotency', () => {
  test('a repeated idempotency key returns the first result and changes nothing', async () => {
    const user = await signUpNewUser();
    const batch = scanBatch([stack(angelicCurator, { quantity: 2 }), stack(delverInnistrad)]);
    const first = await committed(user, batch);
    await committed(user, scanBatch([stack(angelicCurator)]));
    const before = await collectionOf(user);

    const replay = await committed(user, { ...batch, items: [...batch.items].reverse() });

    expect(replay).toEqual({ ...first, replayed: true });
    expect(await collectionOf(user)).toEqual(before);
  });

  test('a repeated idempotency key with different items fails with idempotency_conflict', async () => {
    const user = await signUpNewUser();
    const batch = scanBatch([stack(angelicCurator, { quantity: 2 })]);
    await committed(user, batch);

    const { result, error } = await addScanBatch(user, { ...batch, items: [stack(angelicCurator, { quantity: 3 })] });

    expect(result).toBeNull();
    expect(error).toMatchObject({ code: 'idempotency_conflict', field: 'idempotency_key' });
    expect(await entriesOf(user)).toEqual([entryRow(angelicCurator, 2)]);
  });

  test("another user's idempotency key does not replay their addition", async () => {
    const batch = scanBatch([stack(angelicCurator)]);
    const first = await committed(alice, batch);

    const second = await committed(bob, { ...batch, items: [stack(delverInnistrad)] });

    expect(second.replayed).toBe(false);
    expect(second.addition_id).not.toBe(first.addition_id);
  });
});

test('concurrent commits of the same copies end with the summed quantity in one collection entry', async () => {
  const user = await signUpNewUser();

  const results = await Promise.all(
    Array.from({ length: 4 }, (_, index) =>
      addScanBatch(user, scanBatch([stack(angelicCurator, { quantity: index + 1 })])),
    ),
  );

  expect(results.map(({ error }) => error)).toEqual([null, null, null, null]);
  expect(await entriesOf(user)).toEqual([entryRow(angelicCurator, 10)]);
  expect((await additionsOf(user)).length).toBe(4);
});

test('concurrent commits with one idempotency key add the copies once', async () => {
  const user = await signUpNewUser();
  const batch = scanBatch([stack(angelicCurator, { quantity: 2 })]);

  const results = await Promise.all(Array.from({ length: 3 }, () => committed(user, batch)));

  expect(results.filter((result) => !result.replayed).length).toBe(1);
  expect(await entriesOf(user)).toEqual([entryRow(angelicCurator, 2)]);
});

describe('access', () => {
  beforeAll(async () => {
    await committed(alice, scanBatch([stack(angelicCurator, { quantity: 2 })]));
  });

  test("a user never reads another user's collection entries, additions, or addition lines", async () => {
    expect((await entriesOf(alice)).length).toBeGreaterThan(0);
    expect((await additionsOf(alice)).length).toBeGreaterThan(0);
    expect((await linesOf(alice)).length).toBeGreaterThan(0);
    for (const table of ['collection_entries', 'collection_additions', 'collection_addition_lines'] as const) {
      const { data, error } = await bob.client.from(table).select('user_id').eq('user_id', alice.userId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  test('an anonymous caller reads nothing and cannot commit a scan batch', async () => {
    const anonymous = anonymousClient();
    for (const table of ['collection_entries', 'collection_additions', 'collection_addition_lines'] as const) {
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
        idempotency_key: crypto.randomUUID(),
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
        ...stack(delverInnistrad),
        addition_id: addition!.id,
        user_id: alice.userId,
        entry_quantity: 1,
      };

      expect((await lines().insert(row)).error?.code).toBe(permissionDenied);
      expect((await lines().update({ quantity: 99 }).eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
      expect((await lines().delete().eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
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

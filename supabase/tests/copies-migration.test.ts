import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { join } from 'node:path';

import type { CollectionRow, CollectionTotal } from '../collection';
import type { SearchPage } from '../search';
import { catalogFixtureManifest, latestRun, runCatalogImport, runPriceImport } from './catalog-import-command';
import { collectionEntryKey } from './copy-seeds';
import { asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(180_000);

const migrationBeforeCopies = '20261026090000';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const ribbonsOfNight = '010eba83-30ec-4cca-b07e-f24d8d2f0787';

type OldAdditionLine = {
  card_printing_id: string;
  finish?: string;
  quantity: number;
  is_protected?: boolean;
  user_tag_ids?: string[];
};

async function supabaseCli(...args: string[]) {
  const command = Bun.spawn(['bunx', 'supabase@2.120.0', ...args], {
    cwd: join(import.meta.dir, '..', '..'),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(command.stdout).text(),
    new Response(command.stderr).text(),
    command.exited,
  ]);
  return { exitCode, output: stdout + stderr };
}

async function resetToBeforeCopies() {
  const { exitCode, output } = await supabaseCli('db', 'reset', '--local', '--no-seed', '--version', migrationBeforeCopies);
  expect(output).not.toContain('20261027');
  expect(exitCode).toBe(0);
  const catalogImport = await runCatalogImport(catalogFixtureManifest);
  expect(catalogImport.exitCode).toBe(1);
  expect(catalogImport.output).toContain('Recompute deck evaluations:');
  expect((await latestRun('catalog')).status).toBe('succeeded');
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
}

function applyPendingMigrations() {
  return supabaseCli('migration', 'up', '--local');
}

async function addOldAdditionWithoutCopyIds(user: TestUser, lines: OldAdditionLine[]) {
  await asDatabaseOwner((database) =>
    database.begin(async (transaction) => {
      const [addition] = await transaction`
        insert into public.collection_additions (user_id, added_at, copy_count, source)
        values (${user.userId}, now() - interval '30 days', ${lines.reduce((sum, line) => sum + line.quantity, 0)}, 'scan_batch')
        returning id`;
      for (const line of lines) {
        const finish = line.finish ?? 'nonfoil';
        const [entry] = await transaction`
          insert into public.collection_entries (
            user_id, card_printing_id, finish, condition, language, is_protected, user_tag_ids, quantity, latest_addition_at
          )
          values (
            ${user.userId}, ${line.card_printing_id}, ${finish}, 'near_mint', 'en', ${line.is_protected ?? false},
            ${`{${(line.user_tag_ids ?? []).join(',')}}`}::uuid[], ${line.quantity}, now() - interval '30 days'
          )
          returning id`;
        await transaction`
          insert into public.collection_addition_lines (
            addition_id, user_id, card_printing_id, finish, condition, language, quantity, collection_entry_id, entry_quantity
          )
          values (
            ${addition.id}, ${user.userId}, ${line.card_printing_id}, ${finish}, 'near_mint', 'en', ${line.quantity},
            ${entry.id}, ${line.quantity}
          )`;
      }
    }),
  );
}

async function collectionEntries(user: TestUser) {
  const { data, error } = await user.client.rpc('search_collection', { query: { limit: 50 } });
  expect(error).toBeNull();
  const quantities = new Map<string, number>();
  for (const row of (data as unknown as SearchPage<CollectionRow>).items) {
    const key = collectionEntryKey(row);
    quantities.set(key, (quantities.get(key) ?? 0) + row.quantity);
  }
  return Object.fromEntries([...quantities].toSorted());
}

async function collectionTotal(user: TestUser) {
  const { data, error } = await user.client.rpc('get_collection_total', { query: {} });
  expect(error).toBeNull();
  const { total, currency, priced_copies, copies } = data as unknown as CollectionTotal;
  return { total, currency, priced_copies, copies };
}

async function snapshot(user: TestUser) {
  return { entries: await collectionEntries(user), total: await collectionTotal(user) };
}

type AdditionLineKey = { addition_id: string; card_printing_id: string; finish: string; condition: string; language: string };

function additionLineKey(row: AdditionLineKey) {
  return [row.addition_id, row.card_printing_id, row.finish, row.condition, row.language].join(' ');
}

async function rowsOf(user: TestUser, table: 'copies' | 'collection_addition_copies' | 'collection_addition_lines') {
  const { data, error } = await user.client.from(table).select('*');
  expect(error).toBeNull();
  return data!;
}

async function storedCopies(user: TestUser) {
  return (await rowsOf(user, 'copies')) as (AdditionLineKey & { id: string; is_protected: boolean })[];
}

async function recordedCopyIds(user: TestUser) {
  return ((await rowsOf(user, 'collection_addition_copies')) as { copy_id: string }[]).map((row) => row.copy_id);
}

describe('the migration to copies', () => {
  afterAll(applyPendingMigrations);

  test('stops and changes nothing when collection entries and addition lines disagree', async () => {
    await resetToBeforeCopies();
    const user = await signUpNewUser();
    await addOldAdditionWithoutCopyIds(user, [{ card_printing_id: angelicCurator, quantity: 2 }]);
    await asDatabaseOwner((database) => database`update public.collection_entries set quantity = 3 where user_id = ${user.userId}`);

    const { exitCode, output } = await applyPendingMigrations();

    expect(exitCode).not.toBe(0);
    expect(output).toContain('has 3 copies of card printing');
    expect(await collectionEntries(user)).toEqual({ [`${angelicCurator} nonfoil near_mint en false`]: 3 });
    expect(await recordedCopyIds(user)).toEqual([]);
    expect((await user.client.from('copies').select('*')).error).not.toBeNull();
  });

  describe('on a collection with scanned copies, older additions, protected entries, and user tag IDs', () => {
    let alice: TestUser;
    let bob: TestUser;
    let scannedCopyIds: string[];
    let before: { alice: Awaited<ReturnType<typeof snapshot>>; bob: Awaited<ReturnType<typeof snapshot>> };

    beforeAll(async () => {
      await resetToBeforeCopies();
      [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
      await addOldAdditionWithoutCopyIds(alice, [
        { card_printing_id: ribbonsOfNight, quantity: 3 },
        { card_printing_id: angelicCurator, quantity: 2, is_protected: true },
        { card_printing_id: delverInnistrad, finish: 'foil', quantity: 1, user_tag_ids: [crypto.randomUUID()] },
      ]);
      const scanned = scanBatch([
        stack(angelicCurator, { copies: 4 }),
        stack(ribbonsOfNight),
        stack(delverInnistrad, { finish: 'foil', copies: 2 }),
      ]);
      await committed(alice, scanned);
      const bobsBatch = scanBatch([stack(delverInnistrad, { copies: 2 })]);
      await committed(bob, bobsBatch);
      scannedCopyIds = [...scanned.items, ...bobsBatch.items].flatMap((item) => item.copy_ids);
      before = { alice: await snapshot(alice), bob: await snapshot(bob) };

      const { exitCode, output } = await applyPendingMigrations();
      expect(output).toContain('20261027090000');
      expect(exitCode).toBe(0);
    });

    test('the collection entries before the migration have the expected quantities', () => {
      expect(before.alice.entries).toEqual({
        [`${angelicCurator} nonfoil near_mint en false`]: 4,
        [`${angelicCurator} nonfoil near_mint en true`]: 2,
        [`${delverInnistrad} foil near_mint en false`]: 3,
        [`${ribbonsOfNight} nonfoil near_mint en false`]: 4,
      });
      expect(before.alice.total.copies).toBe(13);
    });

    test('each addition line gives one copy per unit of its quantity', async () => {
      for (const user of [alice, bob]) {
        const lines = (await rowsOf(user, 'collection_addition_lines')) as (AdditionLineKey & { quantity: number })[];
        const copies = (await storedCopies(user)).map(additionLineKey);
        expect(lines.length).toBeGreaterThan(0);
        expect(copies.toSorted()).toEqual(lines.flatMap((line) => Array(line.quantity).fill(additionLineKey(line))).toSorted());
      }
    });

    test('scanned copies keep their copy IDs, and older copies get new copy IDs that are recorded as added', async () => {
      const copyIds = [...(await storedCopies(alice)), ...(await storedCopies(bob))].map((copy) => copy.id);
      const recorded = [...(await recordedCopyIds(alice)), ...(await recordedCopyIds(bob))];

      expect(copyIds.length).toBe(15);
      expect(new Set(copyIds).size).toBe(15);
      expect(copyIds).toEqual(expect.arrayContaining(scannedCopyIds));
      expect(recorded.toSorted()).toEqual(copyIds.toSorted());
    });

    test('copies take the protected flag of the collection entry their addition line went into', async () => {
      const protectedCopies = (await storedCopies(alice)).filter((copy) => copy.is_protected);

      expect(protectedCopies.map((copy) => copy.card_printing_id)).toEqual([angelicCurator, angelicCurator]);
      expect(protectedCopies.filter((copy) => scannedCopyIds.includes(copy.id))).toEqual([]);
    });

    test('collection entries come back as the same groups with the same quantities, and user tag IDs no longer split them', async () => {
      expect(await collectionEntries(alice)).toEqual(before.alice.entries);
      expect(await collectionEntries(bob)).toEqual(before.bob.entries);
    });

    test('the collection total and its coverage stay the same', async () => {
      expect(await collectionTotal(alice)).toEqual(before.alice.total);
      expect(await collectionTotal(bob)).toEqual(before.bob.total);
    });

    test('a replay of a scan batch from before the migration adds no copy', async () => {
      const replay = await committed(alice, {
        items: [{ ...stack(angelicCurator), copy_ids: scannedCopyIds.slice(0, 4) }],
      });

      expect(replay.addition_id).toBeNull();
      expect(await collectionEntries(alice)).toEqual(before.alice.entries);
    });
  });
});

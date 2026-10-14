import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import { join } from 'node:path';

import type { CollectionRow, CollectionTotal } from '../collection';
import type { SearchPage } from '../search';
import { catalogFixtureManifest, runCatalogImport, runPriceImport } from './catalog-import-command';
import { asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(180_000);

const migrationBeforeCopies = '20261026090000';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const ribbonsOfNight = '010eba83-30ec-4cca-b07e-f24d8d2f0787';

type OldLine = {
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
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
}

async function applyPendingMigrations() {
  const result = await supabaseCli('migration', 'up', '--local');
  await asDatabaseOwner((database) => database`notify pgrst, 'reload schema'`);
  await Bun.sleep(1000);
  return result;
}

async function addOldAdditionWithoutCopyIds(user: TestUser, lines: OldLine[]) {
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
    const key = [row.printing_id, row.finish, row.condition, row.language, row.protected].join(' ');
    quantities.set(key, (quantities.get(key) ?? 0) + row.quantity);
  }
  return Object.fromEntries([...quantities].toSorted());
}

async function collectionTotals(user: TestUser) {
  const totals: CollectionTotal[] = [];
  for (const price_currency of ['USD', 'EUR']) {
    const { data, error } = await user.client.rpc('get_collection_total', { query: { price_currency } });
    expect(error).toBeNull();
    totals.push(data as unknown as CollectionTotal);
  }
  return totals;
}

async function snapshot(user: TestUser) {
  return { entries: await collectionEntries(user), totals: await collectionTotals(user) };
}

function copiesPerLine(userId: string) {
  return asDatabaseOwner(
    (database) => database`
      select line.addition_id, line.card_printing_id, line.finish, line.quantity, count(copy.id)::integer as copies
      from public.collection_addition_lines line
      left join public.copies copy
        on (copy.addition_id, copy.card_printing_id, copy.finish, copy.condition, copy.language)
          = (line.addition_id, line.card_printing_id, line.finish, line.condition, line.language)
      where line.user_id = ${userId}
      group by line.addition_id, line.card_printing_id, line.finish, line.quantity
      order by line.addition_id, line.card_printing_id, line.finish`,
  );
}

function copyIdsOf(userId: string) {
  return asDatabaseOwner(async (database) =>
    (await database`select id from public.copies where user_id = ${userId}`).map((row: { id: string }) => row.id),
  );
}

describe('the migration to copies', () => {
  test('stops and changes nothing when collection entries and addition lines disagree', async () => {
    await resetToBeforeCopies();
    const user = await signUpNewUser();
    await addOldAdditionWithoutCopyIds(user, [{ card_printing_id: angelicCurator, quantity: 2 }]);
    await asDatabaseOwner((database) => database`update public.collection_entries set quantity = 3 where user_id = ${user.userId}`);

    const { exitCode, output } = await applyPendingMigrations();

    expect(exitCode).not.toBe(0);
    expect(output).toContain('has 3 copies of card printing');
    const [entries] = await asDatabaseOwner(
      (database) => database`select count(*)::integer as count from public.collection_entries where user_id = ${user.userId}`,
    );
    expect(entries.count).toBe(1);
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
      expect(before.alice.totals.map((total) => total.copies)).toEqual([13, 13]);
    });

    test('each addition line gives one copy per unit of its quantity', async () => {
      for (const user of [alice, bob]) {
        const lines = await copiesPerLine(user.userId);
        expect(lines.length).toBeGreaterThan(0);
        lines.forEach((line: { quantity: number; copies: number }) => expect(line.copies).toBe(line.quantity));
      }
    });

    test('scanned copies keep their copy IDs, and older copies get new copy IDs that are recorded as added', async () => {
      const copyIds = [...(await copyIdsOf(alice.userId)), ...(await copyIdsOf(bob.userId))];
      const recorded = await asDatabaseOwner(async (database) =>
        (
          await database`select copy_id from public.collection_addition_copies where user_id in (${alice.userId}, ${bob.userId})`
        ).map((row: { copy_id: string }) => row.copy_id),
      );

      expect(copyIds.length).toBe(15);
      expect(new Set(copyIds).size).toBe(15);
      expect(copyIds).toEqual(expect.arrayContaining(scannedCopyIds));
      expect(recorded.toSorted()).toEqual(copyIds.toSorted());
    });

    test('collection entries come back as the same groups with the same quantities, and user tag IDs no longer split them', async () => {
      expect(await collectionEntries(alice)).toEqual(before.alice.entries);
      expect(await collectionEntries(bob)).toEqual(before.bob.entries);
    });

    test('the collection total and its coverage stay the same', async () => {
      expect(await collectionTotals(alice)).toEqual(before.alice.totals);
      expect(await collectionTotals(bob)).toEqual(before.bob.totals);
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

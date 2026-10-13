import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  catalogFixtureManifest,
  resetCardCatalog,
  runCatalogImport,
  runImportCommand,
  runPriceImport,
} from './catalog-import-command';
import {
  anonymousClient,
  asAnonymousCaller,
  asSignedInUser,
  signUpNewUser,
  type AppClient,
  type TestUser,
} from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';

type PerUserTable =
  | 'profiles'
  | 'collection_entries'
  | 'collection_additions'
  | 'collection_addition_lines'
  | 'collection_addition_copies'
  | 'collection_daily_totals';

const perUserTables: PerUserTable[] = [
  'profiles',
  'collection_entries',
  'collection_additions',
  'collection_addition_lines',
  'collection_addition_copies',
  'collection_daily_totals',
];

let alice: TestUser;
let bob: TestUser;

async function userIdsInTable(user: TestUser, table: PerUserTable) {
  const { data, error } = await user.client.from(table).select('user_id');
  expect(error).toBeNull();
  return [...new Set(data!.map((row) => row.user_id))];
}

async function userIdsInView(user: TestUser, view: 'collection_availability' | 'collection_totals') {
  const rows = await asSignedInUser(user, (database) =>
    database`select distinct user_id from ${database('private.' + view)}`,
  );
  return rows.map((row: { user_id: string }) => row.user_id);
}

beforeAll(async () => {
  [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  await committed(alice, scanBatch([stack(angelicCurator, { copies: 2 })]));
  await committed(bob, scanBatch([stack(angelicCurator), stack(delverInnistrad)]));
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runImportCommand('collection-totals')).exitCode).toBe(0);
});

describe('a read with no user filter', () => {
  test.each(perUserTables)("returns only the caller's rows from %s", async (table) => {
    expect(await userIdsInTable(alice, table)).toEqual([alice.userId]);
    expect(await userIdsInTable(bob, table)).toEqual([bob.userId]);
  });

  test.each(perUserTables)('is refused to an anonymous caller on %s', async (table) => {
    const { error } = await anonymousClient().from(table).select('user_id');

    expect(error?.code).toBe(permissionDenied);
  });

  test.each(['collection_availability', 'collection_totals'] as const)(
    "returns only the caller's rows from the %s view",
    async (view) => {
      expect(await userIdsInView(alice, view)).toEqual([alice.userId]);
      expect(await userIdsInView(bob, view)).toEqual([bob.userId]);
    },
  );

  test.each(['collection_availability', 'collection_totals'] as const)(
    'is refused to an anonymous caller on the %s view',
    async (view) => {
      const read = asAnonymousCaller((database) => database`select user_id from ${database('private.' + view)}`);

      await expect(read).rejects.toMatchObject({ errno: permissionDenied });
    },
  );
});

test('a signed-in user cannot run a private helper that no read calls', async () => {
  const run = asSignedInUser(alice, (database) => database`select private.check_scan_batch('{}'::jsonb)`);

  await expect(run).rejects.toMatchObject({ errno: permissionDenied });
});

test.each<[string, () => AppClient]>([
  ['a signed-in user', () => alice.client],
  ['an anonymous caller', anonymousClient],
])('%s cannot write search telemetry', async (_caller, client) => {
  const { error } = await client()
    .from('search_telemetry')
    .insert({
      search_id: crypto.randomUUID(),
      api: 'catalog',
      caller: 'release_check',
      query: {},
      result_count: 0,
      latency_ms: 0,
      result_ids: [],
    });

  expect(error?.code).toBe(permissionDenied);
});

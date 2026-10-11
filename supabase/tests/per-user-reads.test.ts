import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { anonymousClient, asAnonymousCaller, asSignedInUser, signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';

const perUserRelations = [
  'public.profiles',
  'public.collection_entries',
  'public.collection_additions',
  'public.collection_addition_lines',
  'private.collection_availability',
];

let alice: TestUser;
let bob: TestUser;

async function userIdsWithNoUserFilter(user: TestUser, relation: string) {
  const rows = await asSignedInUser(user, (database) => database.unsafe(`select distinct user_id from ${relation}`));
  return rows.map((row: { user_id: string }) => row.user_id);
}

beforeAll(async () => {
  [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  await committed(alice, scanBatch([stack(angelicCurator, { quantity: 2 })]));
  await committed(bob, scanBatch([stack(angelicCurator), stack(delverInnistrad)]));
});

describe('a read with no user filter', () => {
  test.each(perUserRelations)("returns only the caller's rows from %s", async (relation) => {
    expect(await userIdsWithNoUserFilter(alice, relation)).toEqual([alice.userId]);
    expect(await userIdsWithNoUserFilter(bob, relation)).toEqual([bob.userId]);
  });

  test.each(perUserRelations)('is refused to an anonymous caller on %s', async (relation) => {
    const read = asAnonymousCaller((database) => database.unsafe(`select user_id from ${relation}`));

    await expect(read).rejects.toMatchObject({ errno: permissionDenied });
  });
});

test('a signed-in user cannot run a private helper that no read calls', async () => {
  const run = asSignedInUser(alice, (database) => database`select private.check_scan_batch('{}'::jsonb)`);

  await expect(run).rejects.toMatchObject({ errno: permissionDenied });
});

test('a signed-in user cannot write search telemetry', async () => {
  const { error } = await alice.client.from('search_telemetry').insert({
    search_id: crypto.randomUUID(),
    user_id: alice.userId,
    api: 'catalog',
    caller: 'app',
    query: {},
    result_count: 0,
    latency_ms: 0,
    result_ids: [],
  });

  expect(error?.code).toBe(permissionDenied);
});

test('an anonymous caller cannot write search telemetry', async () => {
  const { error } = await anonymousClient().from('search_telemetry').insert({
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

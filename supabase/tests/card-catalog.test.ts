import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';
import type { SupabaseClient } from '@supabase/supabase-js';

import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { anonymousClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const catalogTables = ['cards', 'card_faces', 'card_printings'];

let alice: TestUser;
let fogOracleId: string;

function catalogTable(client: AppClient, table: string) {
  return (client as unknown as SupabaseClient).from(table);
}

beforeAll(async () => {
  alice = await signUpNewUser();
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  const { data } = await alice.client.from('cards').select('oracle_id').eq('name', 'Fog').single();
  fogOracleId = data!.oracle_id;
});

test.each(catalogTables)('a signed-in user reads %s', async (table) => {
  const { data, error } = await catalogTable(alice.client, table).select('oracle_id').eq('oracle_id', fogOracleId);

  expect(error).toBeNull();
  expect(data!.length).toBeGreaterThan(0);
});

test.each(catalogTables)('an anonymous caller reads no %s', async (table) => {
  const { data } = await catalogTable(anonymousClient(), table).select('oracle_id').limit(1);

  expect(data ?? []).toEqual([]);
});

describe('direct writes to the card catalog are refused', () => {
  test.each(catalogTables)('update %s', async (table) => {
    const { error } = await catalogTable(alice.client, table).update({ oracle_id: fogOracleId }).eq('oracle_id', fogOracleId);

    expect(error?.code).toBe(permissionDenied);
  });

  test.each(catalogTables)('delete %s', async (table) => {
    const { error } = await catalogTable(alice.client, table).delete().eq('oracle_id', fogOracleId);

    expect(error?.code).toBe(permissionDenied);
  });

  test.each(catalogTables)('anonymous delete %s', async (table) => {
    const { error } = await catalogTable(anonymousClient(), table).delete().eq('oracle_id', fogOracleId);

    expect(error?.code).toBe(permissionDenied);
  });

  test.each(catalogTables)('insert %s', async (table) => {
    const { error } = await catalogTable(alice.client, table).insert({ oracle_id: crypto.randomUUID() });

    expect(error?.code).toBe(permissionDenied);
  });

  test.each(catalogTables)('anonymous insert %s', async (table) => {
    const { error } = await catalogTable(anonymousClient(), table).insert({ oracle_id: crypto.randomUUID() });

    expect(error?.code).toBe(permissionDenied);
  });
});

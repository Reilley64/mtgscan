import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CollectionPrintingsPage } from '../collection';
import { testUser } from '../test-user/account';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runTestUserCommand } from './catalog-import-command';
import { anonymousClient, type AppClient } from './local-stack';

setDefaultTimeout(60_000);

async function signedInTestUser(): Promise<AppClient> {
  const client = anonymousClient();
  const { error } = await client.auth.signInWithPassword(testUser);
  expect(error).toBeNull();
  return client;
}

async function ownedCardPrintings(client: AppClient) {
  const { data, error } = await client.rpc('list_collection_printings', { query: { limit: 120 } });
  expect(error).toBeNull();
  return (data as unknown as CollectionPrintingsPage).items;
}

async function additions(client: AppClient) {
  const { data, error } = await client.from('collection_additions').select('copy_count, source');
  expect(error).toBeNull();
  return data!;
}

describe('the test user command', () => {
  beforeAll(async () => {
    await resetCardCatalog();
  });

  test.each(['https://abcdefghijklmnop.supabase.co', 'http://127.0.0.1.example.com:54321', 'https://localhost:54321'])(
    'refuses Supabase at %p, which is not the local stack',
    async (url) => {
      const { exitCode, output } = await runTestUserCommand(['--sample-collection'], { SUPABASE_URL: url });

      expect(exitCode).toBe(2);
      expect(output).toContain('The test user is only for local Supabase.');
    },
  );

  test('with an empty card catalog, --sample-collection says to import the card catalog first', async () => {
    const { exitCode, output } = await runTestUserCommand(['--sample-collection']);

    expect(exitCode).toBe(1);
    expect(output).toContain('The card catalog is empty.');
  });

  test('the test user signs in with the local default password and has an empty collection', async () => {
    const { exitCode, output } = await runTestUserCommand([]);

    expect(exitCode).toBe(0);
    expect(output).toContain(`The test user ${testUser.email} is ready.`);
    expect(await ownedCardPrintings(await signedInTestUser())).toEqual([]);
  });

  test('--sample-collection adds sample collection entries to the test user through add_scan_batch', async () => {
    expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);

    const { exitCode, output } = await runTestUserCommand(['--sample-collection']);

    expect(exitCode).toBe(0);
    expect(output).toContain('Added 30 sample collection entries.');
    const client = await signedInTestUser();
    const printings = await ownedCardPrintings(client);
    expect(printings).toHaveLength(30);
    expect(await additions(client)).toEqual([
      { copy_count: printings.reduce((total, printing) => total + printing.owned_quantity, 0), source: 'scan_batch' },
    ]);
  });

  test('running the command again resets the test user to an empty collection', async () => {
    expect((await runTestUserCommand(['--sample-collection'])).exitCode).toBe(0);

    expect((await runTestUserCommand([])).exitCode).toBe(0);

    const client = await signedInTestUser();
    expect(await ownedCardPrintings(client)).toEqual([]);
    expect(await additions(client)).toEqual([]);
  });
});

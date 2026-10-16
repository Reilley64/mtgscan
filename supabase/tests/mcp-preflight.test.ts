import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { testUser } from '../test-user/account';
import {
  catalogFixtureManifest,
  resetCardCatalog,
  runCatalogImport,
  runMcpPreflightCommand,
  runTestUserCommand,
} from './catalog-import-command';
import { asDatabaseOwner } from './local-stack';

setDefaultTimeout(120_000);

function leftoversOf(output: string) {
  const clientIds = [...output.matchAll(/client_id ([0-9a-f-]{36})/g)].map(([, id]) => id!);
  const deckIds = [...output.matchAll(/deck_id ([0-9a-f-]{36})/g)].map(([, id]) => id!);
  return asDatabaseOwner(async (database) => ({
    created: { aiClients: new Set(clientIds).size, decks: deckIds.length },
    aiClients: await database`select id from auth.oauth_clients where id in ${database(clientIds)} and deleted_at is null`,
    decks: await database`select id from public.decks where id in ${database(deckIds)}`,
  }));
}

function checkLines(output: string): string[] {
  return output.split('\n').filter((line) => /^(PASS|FAIL) {2}/.test(line));
}

describe('the MCP pre-flight command', () => {
  beforeAll(async () => {
    expect((await runTestUserCommand([])).exitCode).toBe(0);
  });

  test('refuses a Supabase URL that is not local without --hosted', async () => {
    const { exitCode, output } = await runMcpPreflightCommand([], { SUPABASE_URL: 'https://example.supabase.co' });

    expect(exitCode).toBe(2);
    expect(output).toContain('Without --hosted, the pre-flight runs only on local Supabase');
    expect(checkLines(output)).toEqual([]);
  });

  test.each([
    ['no password', {}],
    ['the local default password', { EXPO_PUBLIC_TEST_USER_PASSWORD: testUser.password }],
  ])('with --hosted, refuses %s for the test user', async (_, env) => {
    const { exitCode, output } = await runMcpPreflightCommand(['--hosted'], { EXPO_PUBLIC_TEST_USER_PASSWORD: '', ...env });

    expect(exitCode).toBe(2);
    expect(output).toContain('The local default password is refused.');
    expect(checkLines(output)).toEqual([]);
  });

  test('passes every check on the local stack and leaves no AI client or deck behind', async () => {
    await resetCardCatalog();
    expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);

    const { exitCode, output } = await runMcpPreflightCommand([]);

    expect(checkLines(output).filter((line) => line.startsWith('FAIL'))).toEqual([]);
    expect(checkLines(output).length).toBeGreaterThan(30);
    expect(output).toContain(`${checkLines(output).length} passed, 0 failed.`);
    expect(exitCode).toBe(0);
    expect(await leftoversOf(output)).toEqual({ created: { aiClients: 2, decks: 1 }, aiClients: [], decks: [] });
  });

  test('fails a check, exits with 1, and still deletes its AI clients and its deck', async () => {
    await resetCardCatalog();

    const { exitCode, output } = await runMcpPreflightCommand([]);

    expect(checkLines(output)).toContain('FAIL  A read tool returns its result: search_catalog finds Counterspell');
    expect(checkLines(output)).toContain('PASS  The test user creates the pre-flight deck in the app');
    expect(checkLines(output)).toContain('PASS  Cleanup deletes the pre-flight deck and its deck suggestions');
    expect(checkLines(output)).toContain('PASS  Cleanup deletes the pre-flight AI clients');
    expect(exitCode).toBe(1);
    expect(await leftoversOf(output)).toEqual({ created: { aiClients: 2, decks: 1 }, aiClients: [], decks: [] });
  });
});

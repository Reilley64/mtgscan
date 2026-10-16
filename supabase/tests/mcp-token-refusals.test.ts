import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { SQL } from 'bun';

import { basicLand, catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { asDatabaseOwner, asDatabaseRole, localStackUrl, signUpNewUser, type TestUser } from './local-stack';
import { stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const refusal = 'AI clients cannot change decks or the collection.';
const securityDefinerReads = ['catalog_freshness', 'search_oracle_tags'];
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const forest = basicLand('Forest').oracle_id;

type DatabaseFunction = { name: string; argument_types: string[] };

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

function mcpToken(user: TestUser) {
  return {
    sub: user.userId,
    role: 'authenticated',
    aud: ['authenticated', `${localStackUrl}/functions/v1/mcp`],
    client_id: crypto.randomUUID(),
  };
}

function appToken(user: TestUser) {
  return { sub: user.userId, role: 'authenticated', aud: 'authenticated' };
}

function appWriteFunctions(): Promise<DatabaseFunction[]> {
  return asDatabaseOwner(
    (database) => database`
      select
        p.proname as name,
        coalesce(array_agg(format_type(t.type, null) order by t.position) filter (where t.type is not null), '{}') as argument_types
      from pg_proc p
      left join unnest(p.proargtypes::oid[]) with ordinality t(type, position) on true
      where p.pronamespace = 'public'::regnamespace
        and p.prosecdef
        and has_function_privilege('authenticated', p.oid, 'execute')
        and p.proname not in ${database(securityDefinerReads)}
      group by p.oid, p.proname
      order by p.proname
    `,
  );
}

function callWithNulls(database: SQL, { name, argument_types }: DatabaseFunction) {
  return database.unsafe(`select public.${name}(${argument_types.map((type) => `null::${type}`).join(', ')})`);
}

async function refusalOf(user: TestUser, write: DatabaseFunction) {
  try {
    await asDatabaseRole('authenticated', mcpToken(user), (database) => callWithNulls(database, write));
    return null;
  } catch (error) {
    const { errno, message } = error as { errno: string; message: string };
    return { errno, message };
  }
}

async function called(token: Record<string, string | string[]>, name: string, request: object) {
  const [row] = await asDatabaseRole(
    'authenticated',
    token,
    (database) => database`select ${database.unsafe(`public.${name}`)}(${request}::jsonb) as result`,
  );
  return row.result;
}

describe('refusing MCP tokens', () => {
  test('every app write function refuses a token with a client_id', async () => {
    const user = await signUpNewUser();
    const writes = await appWriteFunctions();

    const refusals = [];
    for (const write of writes) {
      refusals.push({ name: write.name, refusal: await refusalOf(user, write) });
    }

    expect(writes.length).toBeGreaterThan(0);
    expect(refusals).toEqual(writes.map(({ name }) => ({ name, refusal: { errno: permissionDenied, message: refusal } })));
  });

  test('every app write function still works for an app token and refuses the same request with a client_id', async () => {
    const user = await signUpNewUser();
    const writesCalled: string[] = [];
    const write = async (name: string, request: object) => {
      await expect(called(mcpToken(user), name, request)).rejects.toMatchObject({ errno: permissionDenied, message: refusal });
      writesCalled.push(name);
      return called(appToken(user), name, request);
    };
    const read = (name: string, query: object) => called(appToken(user), name, query);
    const scanned = stack(angelicCurator, { copies: 2 });
    const [protectedCopy, deckCopy] = scanned.copy_ids as [string, string];

    await write('add_scan_batch', { items: [scanned] });
    await write('set_copy_protected', { copy_id: protectedCopy, protected: true });
    const { user_tag_id } = await write('create_user_tag', { name: 'Signed' });
    await write('set_copy_user_tag', { copy_id: protectedCopy, user_tag_id, tagged: true });
    await write('rename_user_tag', { user_tag_id, name: 'Trade binder' });
    const { deck_id } = await write('create_deck', { name: 'Atraxa' });
    await write('rename_deck', { deck_id, name: 'Atraxa Superfriends' });
    await write('set_deck_priority', { deck_id, priority: 'high' });
    await write('mark_deck_used', { deck_id });
    await write('add_deck_card', { deck_id, copy_id: deckCopy, unprotect: false });
    await write('set_deck_commander', { copy_id: deckCopy, commander: true });
    await write('set_basic_lands', { deck_id, counts: [{ oracle_id: forest, count: 10 }] });
    await write('remove_deck_card', { copy_id: deckCopy });
    const [removal] = (await read('list_deck_changes', { deck_id })).items;
    await write('revert_deck_changes', { deck_id, deck_change_id: removal.deck_change_id, expected_revision: removal.revision, unprotect: false });
    await write('delete_copy', { copy_id: deckCopy });
    await write('delete_user_tag', { user_tag_id });
    await write('delete_deck', { deck_id });

    expect(writesCalled.toSorted()).toEqual((await appWriteFunctions()).map(({ name }) => name));
    const [{ decks }] = await asDatabaseRole('authenticated', appToken(user), (database) => database`select public.list_decks() as decks`);
    expect(decks.items).toEqual([]);
    expect((await read('search_collection', { rows: 'copies' })).items).toEqual([
      expect.objectContaining({ copy_id: protectedCopy, protected: true }),
    ]);
  });

  test('only authenticated can execute private.refuse_mcp_token', async () => {
    const roles = await asDatabaseOwner(
      (database) => database`
        select grantee.role
        from unnest(array['public', 'anon', 'authenticated', 'service_role', 'catalog_importer', 'deck_evaluator']) grantee(role)
        where has_function_privilege(grantee.role, 'private.refuse_mcp_token()', 'execute')
      `,
    );

    expect(roles.map((row: { role: string }) => row.role)).toEqual(['authenticated']);
  });

  test('a read still works with a token with a client_id', async () => {
    const user = await signUpNewUser();
    const { deck_id } = await called(appToken(user), 'create_deck', { name: 'Kinnan' });

    expect(await called(mcpToken(user), 'get_deck', { deck_id })).toMatchObject({ deck_id, name: 'Kinnan' });
    expect(await called(mcpToken(user), 'search_oracle_tags', { text: 'ramp' })).toMatchObject({ items: expect.any(Array) });
    const sources = await asDatabaseRole('authenticated', mcpToken(user), (database) => database`select source from public.catalog_freshness()`);
    expect(sources).toContainEqual({ source: 'catalog' });
  });
});

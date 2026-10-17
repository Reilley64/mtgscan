import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { SQL } from 'bun';

import { appWriteRefusal, claimsOf } from '../mcp-connection';
import { basicLand, catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { connectAiClient, mcpServerUrl } from './ai-clients';
import { asDatabaseOwner, asDatabaseRole, signUpNewUser, tokenClient, type TestUser } from './local-stack';
import { stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const securityDefinerReads = ['catalog_freshness', 'search_oracle_tags'];
const aiWriteFunctions = ['create_planned_swaps'];
const requiresAnAiClientsToken = ['begin_mcp_call', ...aiWriteFunctions];
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const forest = basicLand('Forest').oracle_id;

type Claims = Record<string, string | string[]>;
type DatabaseFunction = { name: string; argument_types: string[] };

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

function aiClientToken(user: TestUser): Claims {
  return {
    sub: user.userId,
    role: 'authenticated',
    aud: ['authenticated', mcpServerUrl],
    client_id: crypto.randomUUID(),
  };
}

function appToken(user: TestUser): Claims {
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
        and p.proname not in ${database([...securityDefinerReads, ...requiresAnAiClientsToken])}
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
    await asDatabaseRole('authenticated', aiClientToken(user), (database) => callWithNulls(database, write));
    return null;
  } catch (error) {
    const { errno, message } = error as { errno: string; message: string };
    return { errno, message };
  }
}

async function callFunction(token: Claims, name: string, argument?: object) {
  const [row] = await asDatabaseRole('authenticated', token, (database) =>
    argument === undefined
      ? database`select ${database.unsafe(`public.${name}`)}() as result`
      : database`select ${database.unsafe(`public.${name}`)}(${argument}::jsonb) as result`,
  );
  return row.result;
}

describe("refusing an AI client's token", () => {
  test("every app write function refuses an AI client's token", async () => {
    const user = await signUpNewUser();
    const writes = await appWriteFunctions();

    const refusals = [];
    for (const write of writes) {
      refusals.push({ name: write.name, refusal: await refusalOf(user, write) });
    }

    expect(writes.length).toBeGreaterThan(0);
    expect(refusals).toEqual(writes.map(({ name }) => ({ name, refusal: { errno: permissionDenied, message: appWriteRefusal } })));
  });

  test("every app write function refuses an AI client's token and accepts the same request from the app", async () => {
    const user = await signUpNewUser();
    const writesCalled: string[] = [];
    const refuseAiClientThenWrite = async (name: string, request: object) => {
      await expect(callFunction(aiClientToken(user), name, request)).rejects.toMatchObject({
        errno: permissionDenied,
        message: appWriteRefusal,
      });
      writesCalled.push(name);
      return callFunction(appToken(user), name, request);
    };
    const read = (name: string, query?: object) => callFunction(appToken(user), name, query);
    const scanned = stack(angelicCurator, { copies: 3 });
    const [protectedCopy, deckCopy, heldCopy] = scanned.copy_ids as [string, string, string];

    await refuseAiClientThenWrite('add_scan_batch', { items: [scanned] });
    await refuseAiClientThenWrite('set_copy_protected', { copy_id: protectedCopy, protected: true });
    const { user_tag_id } = await refuseAiClientThenWrite('create_user_tag', { name: 'Signed' });
    await refuseAiClientThenWrite('set_copy_user_tag', { copy_id: protectedCopy, user_tag_id, tagged: true });
    await refuseAiClientThenWrite('rename_user_tag', { user_tag_id, name: 'Trade binder' });
    const { deck_id } = await refuseAiClientThenWrite('create_deck', { name: 'Atraxa' });
    await refuseAiClientThenWrite('rename_deck', { deck_id, name: 'Atraxa Superfriends' });
    await refuseAiClientThenWrite('set_deck_priority', { deck_id, priority: 'high' });
    await refuseAiClientThenWrite('mark_deck_used', { deck_id });
    await refuseAiClientThenWrite('add_deck_card', { deck_id, copy_id: deckCopy, unprotect: false });
    await refuseAiClientThenWrite('set_deck_commander', { copy_id: deckCopy, commander: true });
    await refuseAiClientThenWrite('set_basic_lands', { deck_id, counts: [{ oracle_id: forest, count: 10 }] });
    const [plannedSwap] = (
      await callFunction(aiClientToken(user), 'create_planned_swaps', {
        idempotency_key: 'release-gate',
        planned_swaps: [
          { ref: 'swap', deck_id, expected_deck_revision: 3, incoming: { copy_id: heldCopy }, reason: 'Another Angelic Curator for the gate.' },
        ],
      })
    ).planned_swaps;
    await refuseAiClientThenWrite('swap_in_planned_swap', { planned_swap_id: plannedSwap.planned_swap_id });
    await refuseAiClientThenWrite('remove_deck_card', { copy_id: deckCopy });
    const [removal] = (await read('list_deck_changes', { deck_id })).items;
    await refuseAiClientThenWrite('revert_deck_changes', {
      deck_id,
      deck_change_id: removal.deck_change_id,
      expected_revision: removal.revision,
      unprotect: false,
    });
    await refuseAiClientThenWrite('delete_copy', { copy_id: deckCopy });
    await refuseAiClientThenWrite('delete_user_tag', { user_tag_id });
    await refuseAiClientThenWrite('delete_deck', { deck_id });

    expect(writesCalled.toSorted()).toEqual((await appWriteFunctions()).map(({ name }) => name));
    expect((await read('list_decks')).items).toEqual([]);
    expect(
      (await read('search_collection', { rows: 'copies' })).items.map((item: { copy_id: string; protected: boolean }) => [item.copy_id, item.protected]).toSorted(),
    ).toEqual(
      [
        [protectedCopy, true],
        [heldCopy, false],
      ].toSorted(),
    );
  });

  test("every AI write function refuses the app's token", async () => {
    const user = await signUpNewUser();

    const refusals = [];
    for (const name of aiWriteFunctions) {
      refusals.push({ name, refusal: await callFunction(appToken(user), name, {}).catch(({ errno, message }) => ({ errno, message })) });
    }

    expect(refusals).toEqual(
      aiWriteFunctions.map((name) => ({ name, refusal: { errno: permissionDenied, message: 'Only an AI client can call this function.' } })),
    );
  });

  test("reads and previews still work with an AI client's token", async () => {
    const user = await signUpNewUser();
    const scanned = stack(angelicCurator, { copies: 2 });
    const [deckCopy, freeCopy] = scanned.copy_ids as [string, string];
    await callFunction(appToken(user), 'add_scan_batch', { items: [scanned] });
    const { deck_id } = await callFunction(appToken(user), 'create_deck', { name: 'Kinnan' });
    await callFunction(appToken(user), 'add_deck_card', { deck_id, copy_id: deckCopy, unprotect: false });
    const [addition] = (await callFunction(appToken(user), 'list_deck_changes', { deck_id })).items;
    const read = (name: string, query?: object) => callFunction(aiClientToken(user), name, query);

    expect(await read('get_deck', { deck_id })).toMatchObject({ deck_id, name: 'Kinnan', card_count: 1 });
    expect(await read('preview_add_deck_card', { copy_id: freeCopy })).toMatchObject({
      items: [{ deck_id, effect: { kind: 'adds_violation' } }],
    });
    expect(await read('preview_revert', { deck_id, deck_change_id: addition.deck_change_id })).toMatchObject({
      revision: 1,
      lines: [{ copy_id: deckCopy, kind: 'copy' }],
    });
    expect(await read('search_oracle_tags', { text: 'ramp' })).toMatchObject({ items: expect.any(Array) });
    const sources = await asDatabaseRole('authenticated', aiClientToken(user), (database) => database`select source from public.catalog_freshness()`);
    expect(sources).toContainEqual({ source: 'catalog' });
  });

  test("the Data API reads with an AI client's real token and an app write function refuses it", async () => {
    const user = await signUpNewUser();
    const { data } = await user.client.rpc('create_deck', { request: { name: 'Tymna' } });
    const { deck_id } = data as { deck_id: string };
    const aiClient = await connectAiClient(user);
    const dataApi = tokenClient(aiClient.token);

    expect(claimsOf(aiClient.token)).toMatchObject({ client_id: aiClient.clientId, aud: ['authenticated', mcpServerUrl] });
    expect((await dataApi.rpc('get_deck', { query: { deck_id } })).data).toMatchObject({ name: 'Tymna' });
    expect((await dataApi.rpc('create_deck', { request: { name: 'Kinnan' } })).error).toMatchObject({
      code: permissionDenied,
      message: appWriteRefusal,
    });
  });
});

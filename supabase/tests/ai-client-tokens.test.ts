import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { SQL } from 'bun';

import type { DatabaseFunction, RequestArguments } from '../database-function';
import { databaseFunctions } from '../database-functions';
import { createDeck, getDeck } from '../decks';
import { appWriteRefusal, claimsOf } from '../mcp-connection';
import { basicLand, catalogFixtureManifest, oracleIdOf, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { aiClientClaims, aiClientReply, connectAiClient, mcpServerUrl } from './ai-clients';
import { collectionCopies } from './collection-pages';
import { call, replyOf } from './database-calls';
import { asDatabaseOwner, asDatabaseRole, signUpNewUser, tokenClient, type TestUser } from './local-stack';
import { stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const securityDefinerReads = ['catalog_freshness', 'search_oracle_tags'];
const aiWriteFunctions = [
  'create_planned_swaps',
  'create_buylist_cards',
  'mcp_close_planned_swap',
  'mcp_close_buylist_card',
  'mcp_create_user_tag',
  'mcp_rename_user_tag',
  'mcp_delete_user_tag',
  'mcp_restore_user_tag',
  'mcp_set_copies_user_tag',
];
const requiresAnAiClientsToken = ['begin_mcp_call', ...aiWriteFunctions];
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const counterspell = '0df55e3f-14de-46ef-b6b1-616618724d9e';
const forest = basicLand('Forest').oracle_id;

type Claims = Record<string, string | string[]>;
type AppWriteFunction = { name: string; argument_types: string[] };

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

function appToken(user: TestUser): Claims {
  return { sub: user.userId, role: 'authenticated', aud: 'authenticated' };
}

function appWriteFunctions(): Promise<AppWriteFunction[]> {
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

function callWithNulls(database: SQL, { name, argument_types }: AppWriteFunction) {
  return database.unsafe(`select public.${name}(${argument_types.map((type) => `null::${type}`).join(', ')})`);
}

async function refusalOf(user: TestUser, write: AppWriteFunction) {
  try {
    const claims = aiClientClaims({ user, clientId: crypto.randomUUID() });
    await asDatabaseRole('authenticated', claims, (database) => callWithNulls(database, write));
    return null;
  } catch (error) {
    const { errno, message } = error as { errno: string; message: string };
    return { errno, message };
  }
}

async function callFunction(token: Claims, name: string, argument: object) {
  const [row] = await asDatabaseRole('authenticated', token, (database) =>
    database`select ${database.unsafe(`public.${name}`)}(${argument}::jsonb) as result`,
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
    const aiClientApi = tokenClient((await connectAiClient(user)).token);
    const writesCalled: string[] = [];
    const refuseAiClientThenWrite = async <Contract extends DatabaseFunction>(
      contract: Contract,
      ...request: RequestArguments<Contract>
    ) => {
      expect(await call(aiClientApi, contract, ...request)).toMatchObject({
        status: 'failed',
        error: { code: permissionDenied, message: appWriteRefusal },
      });
      writesCalled.push(contract.name);
      return replyOf(user.client, contract, ...request);
    };
    const scanned = stack(angelicCurator, { copies: 5 });
    const [protectedCopy, deckCopy, heldCopy, closedCopy, batchCopy] = scanned.copy_ids as [string, string, string, string, string];

    await refuseAiClientThenWrite(databaseFunctions.add_scan_batch, { items: [scanned] });
    await refuseAiClientThenWrite(databaseFunctions.set_copy_protected, { copy_id: protectedCopy, protected: true });
    const { user_tag_id } = await refuseAiClientThenWrite(databaseFunctions.create_user_tag, { name: 'Signed' });
    await refuseAiClientThenWrite(databaseFunctions.set_copy_user_tag, { copy_id: protectedCopy, user_tag_id, tagged: true });
    await refuseAiClientThenWrite(databaseFunctions.rename_user_tag, { user_tag_id, name: 'Trade binder' });
    const { deck_id } = await refuseAiClientThenWrite(databaseFunctions.create_deck, { name: 'Atraxa' });
    await refuseAiClientThenWrite(databaseFunctions.rename_deck, { deck_id, name: 'Atraxa Superfriends' });
    await refuseAiClientThenWrite(databaseFunctions.set_deck_priority, { deck_id, priority: 'high' });
    await refuseAiClientThenWrite(databaseFunctions.mark_deck_used, { deck_id });
    await refuseAiClientThenWrite(databaseFunctions.add_deck_card, { deck_id, copy_id: deckCopy, unprotect: false });
    await refuseAiClientThenWrite(databaseFunctions.set_deck_commander, { copy_id: deckCopy, commander: true });
    await refuseAiClientThenWrite(databaseFunctions.change_basic_land, { deck_id, oracle_id: forest, by: 10 });
    const plannedSwapOf = async (copyId: string, expectedDeckRevision: number) => {
      const { planned_swaps } = await replyOf(aiClientApi, databaseFunctions.create_planned_swaps, {
        idempotency_key: `release-gate-${copyId}`,
        planned_swaps: [
          { ref: 'swap', deck_id, expected_deck_revision: expectedDeckRevision, incoming: { copy_id: copyId }, reason: 'Another Angelic Curator for the gate.' },
        ],
      });
      return { planned_swap_id: planned_swaps[0]!.planned_swap_id };
    };
    await refuseAiClientThenWrite(databaseFunctions.swap_in_planned_swap, await plannedSwapOf(heldCopy, 3));
    await refuseAiClientThenWrite(databaseFunctions.close_planned_swap, await plannedSwapOf(closedCopy, 4));
    await refuseAiClientThenWrite(databaseFunctions.swap_in_planned_swaps, {
      deck_id,
      planned_swap_ids: [(await plannedSwapOf(batchCopy, 4)).planned_swap_id],
    });
    const buylistCardOf = async (expectedDeckRevision: number) => {
      const { buylist_cards } = await replyOf(aiClientApi, databaseFunctions.create_buylist_cards, {
        idempotency_key: `release-gate-buylist-${expectedDeckRevision}`,
        buylist_cards: [
          {
            ref: 'card',
            deck_id,
            expected_deck_revision: expectedDeckRevision,
            incoming: { oracle_id: await oracleIdOf('Counterspell') },
            reason: 'Counterspell answers what the deck cannot.',
          },
        ],
      });
      return buylist_cards[0]!.buylist_card_id;
    };
    const boughtCard = await buylistCardOf(5);
    const bought = stack(counterspell);
    await replyOf(user.client, databaseFunctions.add_scan_batch, { items: [bought] });
    await refuseAiClientThenWrite(databaseFunctions.mark_buylist_card_bought, {
      buylist_card_id: boughtCard,
      copy_id: bought.copy_ids[0]!,
      unprotect: false,
    });
    await refuseAiClientThenWrite(databaseFunctions.close_buylist_card, { buylist_card_id: await buylistCardOf(6) });
    await refuseAiClientThenWrite(databaseFunctions.remove_deck_card, { copy_id: deckCopy });
    const [removal] = (await replyOf(user.client, databaseFunctions.list_deck_changes, { deck_id })).items;
    await refuseAiClientThenWrite(databaseFunctions.revert_deck_changes, {
      deck_id,
      deck_change_id: removal!.deck_change_id,
      expected_revision: removal!.revision,
      unprotect: false,
    });
    await refuseAiClientThenWrite(databaseFunctions.delete_copy, { copy_id: deckCopy });
    await refuseAiClientThenWrite(databaseFunctions.delete_user_tag, { user_tag_id });
    await refuseAiClientThenWrite(databaseFunctions.delete_deck, { deck_id });
    await refuseAiClientThenWrite(databaseFunctions.set_training_crop_uploads, { on: false });

    expect(writesCalled.toSorted()).toEqual((await appWriteFunctions()).map(({ name }) => name));
    expect((await replyOf(user.client, databaseFunctions.list_decks)).items).toEqual([]);
    expect((await collectionCopies(user.client)).items.map((item) => [item.copy_id, item.protected]).toSorted()).toEqual(
      [
        [protectedCopy, true],
        [heldCopy, false],
        [closedCopy, false],
        [batchCopy, false],
        [bought.copy_ids[0], false],
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
    const aiClient = { user, clientId: crypto.randomUUID() };
    const scanned = stack(angelicCurator, { copies: 2 });
    const [deckCopy, freeCopy] = scanned.copy_ids as [string, string];
    await replyOf(user.client, databaseFunctions.add_scan_batch, { items: [scanned] });
    const { deck_id } = await replyOf(user.client, createDeck, { name: 'Kinnan' });
    await replyOf(user.client, databaseFunctions.add_deck_card, { deck_id, copy_id: deckCopy, unprotect: false });
    const [addition] = (await replyOf(user.client, databaseFunctions.list_deck_changes, { deck_id })).items;

    expect(await aiClientReply(aiClient, getDeck, { deck_id })).toMatchObject({ deck_id, name: 'Kinnan', card_count: 1 });
    expect(await aiClientReply(aiClient, databaseFunctions.preview_add_deck_card, { copy_id: freeCopy })).toMatchObject({
      items: [{ deck_id, effect: { kind: 'adds_violation' } }],
    });
    const revert = { deck_id, deck_change_id: addition!.deck_change_id };
    expect(await aiClientReply(aiClient, databaseFunctions.preview_revert, revert)).toMatchObject({
      revision: 1,
      lines: [{ copy_id: deckCopy, kind: 'copy' }],
    });
    expect(await aiClientReply(aiClient, databaseFunctions.search_oracle_tags, { text: 'ramp' })).toMatchObject({
      items: expect.any(Array),
    });
    const sources = await asDatabaseRole(
      'authenticated',
      aiClientClaims(aiClient),
      (database) => database`select source from public.catalog_freshness()`,
    );
    expect(sources).toContainEqual({ source: 'catalog' });
  });

  test("the Data API reads with an AI client's real token and an app write function refuses it", async () => {
    const user = await signUpNewUser();
    const { deck_id } = await replyOf(user.client, createDeck, { name: 'Tymna' });
    const aiClient = await connectAiClient(user);
    const dataApi = tokenClient(aiClient.token);

    expect(claimsOf(aiClient.token)).toMatchObject({ client_id: aiClient.clientId, aud: ['authenticated', mcpServerUrl] });
    expect(await replyOf(dataApi, getDeck, { deck_id })).toMatchObject({ name: 'Tymna' });
    expect(await call(dataApi, createDeck, { name: 'Kinnan' })).toMatchObject({
      status: 'failed',
      error: { code: permissionDenied, message: appWriteRefusal },
    });
  });
});

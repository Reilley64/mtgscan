import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { listBuylist, mcpCloseBuylistCard } from '../buylist';
import {
  createUserTag,
  deleteCopy,
  deleteUserTag,
  getCopy,
  listUserTags,
  mcpCreateUserTag,
  mcpDeleteUserTag,
  mcpRestoreUserTag,
  mcpSetCopiesUserTag,
  renameUserTag,
  searchCollection,
  setCopyUserTag,
} from '../collection';
import { getDeck, listDeckChanges, listDecks } from '../decks';
import { closePlannedSwap, listPlannedSwaps } from '../planned-swaps';
import { setTrainingCropUploads } from '../training-crops';
import { aiClientReply, connectedAiClient } from './ai-clients';
import { oneBuylistCard } from './buylist-card-seeds';
import { catalogFixtureManifest, oracleIdOf, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { seedCopies } from './copy-seeds';
import { replyOf } from './database-calls';
import { asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';
import { counterspell, deckNamed, krenkoDeck, onePlannedSwap, scannedCopy } from './planned-swap-seeds';

setDefaultTimeout(60_000);

const appWrittenTables = [
  'profiles',
  'copies',
  'collection_additions',
  'decks',
  'deck_cards',
  'deck_basic_lands',
  'deck_changes',
  'user_tags',
  'copy_user_tags',
];

let lotusCard: string;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  lotusCard = await oracleIdOf('Black Lotus');
});

type Changers = { created_by: string; updated_by: string };

async function changersOf(user: TestUser, table: string, where: { user_id: string } | { id: string }): Promise<Changers[]> {
  const [column, value] = Object.entries(where)[0]!;
  const { data, error } = await user.client
    .from(table as 'user_tags')
    .select('created_by, updated_by')
    .eq(column as 'id', value);
  expect(error).toBeNull();
  const distinct = new Map(data!.map((row) => [`${row.created_by} ${row.updated_by}`, row]));
  return [...distinct.values()];
}

function changers(createdBy: string, updatedBy = createdBy): Changers[] {
  return [{ created_by: createdBy, updated_by: updatedBy }];
}

async function userTagTimes(user: TestUser, userTagId: string) {
  const { data, error } = await user.client.from('user_tags').select('created_at, updated_at').eq('id', userTagId).single();
  expect(error).toBeNull();
  return { created_at: new Date(data!.created_at), updated_at: new Date(data!.updated_at) };
}

describe('who created and last changed a record', () => {
  test('an app write records the user as who created and last changed each record', async () => {
    const user = await signUpNewUser();
    const { bolt } = await krenkoDeck(user);
    const userTag = await replyOf(user.client, createUserTag, { name: 'Signed' });
    await replyOf(user.client, setCopyUserTag, { copy_id: bolt, user_tag_id: userTag.user_tag_id, tagged: true });
    await replyOf(user.client, setTrainingCropUploads, { on: false });

    for (const table of appWrittenTables) {
      expect({ table, changers: await changersOf(user, table, { user_id: user.userId }) }).toEqual({
        table,
        changers: changers(user.userId),
      });
    }
  });

  test("an AI write records the AI client's ID as who created and last changed the planned swap or buylist card", async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    const buylistCardId = await oneBuylistCard(client, deckId, lotusCard);

    expect(await changersOf(client.user, 'planned_swaps', { id: plannedSwapId })).toEqual(changers(client.clientId));
    expect(await changersOf(client.user, 'buylist_cards', { id: buylistCardId })).toEqual(changers(client.clientId));
  });

  test("an AI client's user tag writes record its ID, and the user taking it off a copy later records the user", async () => {
    const client = await connectedAiClient();
    const { bolt } = await krenkoDeck(client.user);
    const userTag = await aiClientReply(client, mcpCreateUserTag, { name: 'Trade binder' });
    await aiClientReply(client, mcpSetCopiesUserTag, { copy_ids: [bolt], user_tag_id: userTag.user_tag_id, tagged: true });

    expect(await changersOf(client.user, 'user_tags', { id: userTag.user_tag_id })).toEqual(changers(client.clientId));
    expect(await changersOf(client.user, 'copy_user_tags', { user_id: client.user.userId })).toEqual(changers(client.clientId));

    await replyOf(client.user.client, setCopyUserTag, { copy_id: bolt, user_tag_id: userTag.user_tag_id, tagged: false });

    expect(await changersOf(client.user, 'copy_user_tags', { user_id: client.user.userId })).toEqual(
      changers(client.clientId, client.user.userId),
    );
  });

  test("an AI client's delete and restore of the user's user tags record the AI client as who last changed them", async () => {
    const client = await connectedAiClient();
    const deletedByAi = await replyOf(client.user.client, createUserTag, { name: 'Signed' });
    const restoredByAi = await replyOf(client.user.client, createUserTag, { name: 'Sell' });
    await replyOf(client.user.client, deleteUserTag, { user_tag_id: restoredByAi.user_tag_id });

    await aiClientReply(client, mcpDeleteUserTag, { user_tag_id: deletedByAi.user_tag_id });
    await aiClientReply(client, mcpRestoreUserTag, { user_tag_id: restoredByAi.user_tag_id });

    expect(await changersOf(client.user, 'user_tags', { id: deletedByAi.user_tag_id })).toEqual(changers(client.user.userId, client.clientId));
    expect(await changersOf(client.user, 'user_tags', { id: restoredByAi.user_tag_id })).toEqual(changers(client.user.userId, client.clientId));
  });

  test('a change keeps who created the record and records who last changed it', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    const buylistCardId = await oneBuylistCard(client, deckId, lotusCard);
    const userTag = await replyOf(client.user.client, createUserTag, { name: 'Signed' });
    const createdAt = (await userTagTimes(client.user, userTag.user_tag_id)).created_at;

    await replyOf(client.user.client, closePlannedSwap, { planned_swap_id: plannedSwapId });
    await aiClientReply(client, mcpCloseBuylistCard, { buylist_card_id: buylistCardId });
    await replyOf(client.user.client, renameUserTag, { user_tag_id: userTag.user_tag_id, name: 'Autographed' });

    expect(await changersOf(client.user, 'planned_swaps', { id: plannedSwapId })).toEqual(changers(client.clientId, client.user.userId));
    expect(await changersOf(client.user, 'buylist_cards', { id: buylistCardId })).toEqual(changers(client.clientId));
    const times = await userTagTimes(client.user, userTag.user_tag_id);
    expect(times.created_at).toEqual(createdAt);
    expect(times.updated_at.getTime()).toBeGreaterThan(createdAt.getTime());
  });

  test("a side effect of a call records the caller's ID", async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const held = await scannedCopy(client.user, counterspell);
    const plannedSwapId = await onePlannedSwap(client, deckId, held);

    await replyOf(client.user.client, deleteCopy, { copy_id: held, move_planned_swap: true });

    expect(await changersOf(client.user, 'planned_swaps', { id: plannedSwapId })).toEqual(changers(client.clientId, client.user.userId));
    expect(await changersOf(client.user, 'buylist_cards', { user_id: client.user.userId })).toEqual(changers(client.user.userId));
  });

  test("a write with no caller records the record's owner", async () => {
    const user = await signUpNewUser();
    const [[copyId]] = await seedCopies(user, [{ card_printing_id: counterspell }]);

    expect(await changersOf(user, 'copies', { id: copyId! })).toEqual(changers(user.userId));
    expect(await changersOf(user, 'collection_additions', { user_id: user.userId })).toEqual(changers(user.userId));
  });

  test("a caller's values for who created and last changed a record are ignored", async () => {
    const user = await signUpNewUser();
    const someoneElse = crypto.randomUUID();
    const longAgo = '2000-01-01T00:00:00Z';
    const [{ id }] = await asDatabaseOwner(
      (database) => database`
        insert into public.user_tags (user_id, name, created_by, updated_by, updated_at)
        values (${user.userId}, 'Signed', ${someoneElse}, ${someoneElse}, ${longAgo})
        returning id
      `,
    );
    expect(await changersOf(user, 'user_tags', { id })).toEqual(changers(user.userId));
    const inserted = await userTagTimes(user, id);
    expect(inserted.updated_at).toEqual(inserted.created_at);

    await asDatabaseOwner(
      (database) => database`
        update public.user_tags
        set created_by = ${someoneElse}, updated_by = ${someoneElse}, created_at = ${longAgo}, updated_at = ${longAgo}
        where id = ${id}
      `,
    );
    expect(await changersOf(user, 'user_tags', { id })).toEqual(changers(user.userId));
    const updated = await userTagTimes(user, id);
    expect(updated.created_at).toEqual(inserted.created_at);
    expect(updated.updated_at.getTime()).toBeGreaterThan(inserted.created_at.getTime());
  });

  test('no read returns who created or last changed a record', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    await oneBuylistCard(client, deckId, lotusCard);
    const userTag = await replyOf(client.user.client, createUserTag, { name: 'Signed' });
    await replyOf(client.user.client, setCopyUserTag, { copy_id: bolt, user_tag_id: userTag.user_tag_id, tagged: true });

    const reads = [
      await replyOf(client.user.client, getCopy, { copy_id: bolt }),
      await replyOf(client.user.client, getDeck, { deck_id: deckId }),
      await replyOf(client.user.client, listDecks, {}),
      await replyOf(client.user.client, listDeckChanges, { deck_id: deckId }),
      await replyOf(client.user.client, listPlannedSwaps, {}),
      await replyOf(client.user.client, listBuylist, {}),
      await replyOf(client.user.client, searchCollection, {}),
      await replyOf(client.user.client, searchCollection, {}),
      await replyOf(client.user.client, listUserTags),
    ];

    for (const read of reads) {
      expect(JSON.stringify(read)).not.toMatch(/created_by|updated_by/);
    }
  });
});

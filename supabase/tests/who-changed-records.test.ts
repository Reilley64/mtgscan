import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { UserTag } from '../collection';
import { aiClientCall, connectedAiClient } from './ai-clients';
import { oneBuylistCard } from './buylist-card-seeds';
import { catalogFixtureManifest, oracleIdOf, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { seedCopies } from './copy-seeds';
import { asDatabaseOwner, signUpNewUser } from './local-stack';
import {
  appRead,
  appRequest,
  counterspell,
  deckNamed,
  krenkoDeck,
  onePlannedSwap,
  scannedCopy,
} from './planned-swap-seeds';

setDefaultTimeout(60_000);

const appWrittenTables = [
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

async function changersOf(table: string, where: { user_id: string } | { id: string }): Promise<Changers[]> {
  const [column, value] = Object.entries(where)[0]!;
  const rows = await asDatabaseOwner(
    (database) => database`
      select distinct created_by, updated_by
      from ${database.unsafe(`public.${table}`)}
      where ${database.unsafe(column)} = ${value}
    `,
  );
  return [...rows];
}

function changers(createdBy: string, updatedBy = createdBy): Changers[] {
  return [{ created_by: createdBy, updated_by: updatedBy }];
}

async function userTagTimes(userTagId: string) {
  const [row] = await asDatabaseOwner(
    (database) => database`select created_at, updated_at from public.user_tags where id = ${userTagId}`,
  );
  return row as { created_at: Date; updated_at: Date };
}

describe('who created and last changed a record', () => {
  test('an app write records the user as who created and last changed each record', async () => {
    const user = await signUpNewUser();
    const { bolt } = await krenkoDeck(user);
    const userTag = await appRequest<UserTag>(user, 'create_user_tag', { name: 'Signed' });
    await appRequest(user, 'set_copy_user_tag', { copy_id: bolt, user_tag_id: userTag.user_tag_id, tagged: true });

    for (const table of appWrittenTables) {
      expect({ table, changers: await changersOf(table, { user_id: user.userId }) }).toEqual({
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

    expect(await changersOf('planned_swaps', { id: plannedSwapId })).toEqual(changers(client.clientId));
    expect(await changersOf('buylist_cards', { id: buylistCardId })).toEqual(changers(client.clientId));
  });

  test("an AI client's user tag writes record its ID, and the user's later untag records the user", async () => {
    const client = await connectedAiClient();
    const { bolt } = await krenkoDeck(client.user);
    const userTag = await aiClientCall<UserTag>(client, 'mcp_create_user_tag', { name: 'Trade binder' });
    await aiClientCall(client, 'mcp_set_copies_user_tag', { copy_ids: [bolt], user_tag_id: userTag.user_tag_id, tagged: true });

    expect(await changersOf('user_tags', { id: userTag.user_tag_id })).toEqual(changers(client.clientId));
    expect(await changersOf('copy_user_tags', { user_id: client.user.userId })).toEqual(changers(client.clientId));

    await appRequest(client.user, 'set_copy_user_tag', { copy_id: bolt, user_tag_id: userTag.user_tag_id, tagged: false });

    expect(await changersOf('copy_user_tags', { user_id: client.user.userId })).toEqual(
      changers(client.clientId, client.user.userId),
    );
  });

  test('a change keeps who created the record and records who last changed it', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    const buylistCardId = await oneBuylistCard(client, deckId, lotusCard);
    const userTag = await appRequest<UserTag>(client.user, 'create_user_tag', { name: 'Signed' });
    const createdAt = (await userTagTimes(userTag.user_tag_id)).created_at;

    await appRequest(client.user, 'close_planned_swap', { planned_swap_id: plannedSwapId });
    await aiClientCall(client, 'mcp_close_buylist_card', { buylist_card_id: buylistCardId });
    await appRequest(client.user, 'rename_user_tag', { user_tag_id: userTag.user_tag_id, name: 'Autographed' });

    expect(await changersOf('planned_swaps', { id: plannedSwapId })).toEqual(changers(client.clientId, client.user.userId));
    expect(await changersOf('buylist_cards', { id: buylistCardId })).toEqual(changers(client.clientId));
    const times = await userTagTimes(userTag.user_tag_id);
    expect(times.created_at).toEqual(createdAt);
    expect(times.updated_at.getTime()).toBeGreaterThan(createdAt.getTime());
  });

  test("a side effect of a call records the caller's ID", async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const held = await scannedCopy(client.user, counterspell);
    const plannedSwapId = await onePlannedSwap(client, deckId, held);

    await appRequest(client.user, 'delete_copy', { copy_id: held, move_planned_swap: true });

    expect(await changersOf('planned_swaps', { id: plannedSwapId })).toEqual(changers(client.clientId, client.user.userId));
    expect(await changersOf('buylist_cards', { user_id: client.user.userId })).toEqual(changers(client.user.userId));
  });

  test("a write with no caller records the record's owner", async () => {
    const user = await signUpNewUser();
    const [[copyId]] = await seedCopies(user, [{ card_printing_id: counterspell }]);

    expect(await changersOf('copies', { id: copyId! })).toEqual(changers(user.userId));
    expect(await changersOf('collection_additions', { user_id: user.userId })).toEqual(changers(user.userId));
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
    expect(await changersOf('user_tags', { id })).toEqual(changers(user.userId));
    const inserted = await userTagTimes(id);
    expect(inserted.updated_at).toEqual(inserted.created_at);

    await asDatabaseOwner(
      (database) => database`
        update public.user_tags
        set created_by = ${someoneElse}, updated_by = ${someoneElse}, created_at = ${longAgo}, updated_at = ${longAgo}
        where id = ${id}
      `,
    );
    expect(await changersOf('user_tags', { id })).toEqual(changers(user.userId));
    const updated = await userTagTimes(id);
    expect(updated.created_at).toEqual(inserted.created_at);
    expect(updated.updated_at.getTime()).toBeGreaterThan(inserted.created_at.getTime());
  });

  test('no read returns who created or last changed a record', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    await oneBuylistCard(client, deckId, lotusCard);
    const userTag = await appRequest<UserTag>(client.user, 'create_user_tag', { name: 'Signed' });
    await appRequest(client.user, 'set_copy_user_tag', { copy_id: bolt, user_tag_id: userTag.user_tag_id, tagged: true });

    const reads = [
      await appRead(client.user, 'get_copy', { copy_id: bolt }),
      await appRead(client.user, 'get_deck', { deck_id: deckId }),
      await appRead(client.user, 'list_decks', {}),
      await appRead(client.user, 'list_deck_changes', { deck_id: deckId }),
      await appRead(client.user, 'list_planned_swaps', {}),
      await appRead(client.user, 'list_buylist', {}),
      await appRead(client.user, 'search_collection', { rows: 'copies' }),
      await appRead(client.user, 'search_collection', {}),
      (await client.user.client.rpc('list_user_tags')).data,
    ];

    for (const read of reads) {
      expect(JSON.stringify(read)).not.toMatch(/created_by|updated_by/);
    }
  });
});

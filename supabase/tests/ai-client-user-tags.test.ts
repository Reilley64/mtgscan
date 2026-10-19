import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  createUserTag as appCreateUserTag,
  deleteCopy,
  deleteUserTag as appDeleteUserTag,
  listUserTags,
  mcpCreateUserTag,
  mcpDeleteUserTag,
  mcpRenameUserTag,
  mcpRestoreUserTag,
  mcpSetCopiesUserTag,
  type RenameUserTagRequest,
} from '../collection';
import type { RequestOf } from '../database-function';
import { aiClientCall, aiClientReply, connectedAiClient, type ClaimedAiClient } from './ai-clients';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { collectionCopies } from './collection-pages';
import { call, refused, replyOf } from './database-calls';
import { signUpNewUser, type TestUser } from './local-stack';
import { scannedCopies } from './planned-swap-seeds';
import { userTagsOf, userTagsOnCopy } from './user-tag-reads';

setDefaultTimeout(60_000);

const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

function createUserTag(client: ClaimedAiClient, name: string) {
  return aiClientReply(client, mcpCreateUserTag, { name });
}

function setCopiesUserTag(client: ClaimedAiClient, request: RequestOf<typeof mcpSetCopiesUserTag>) {
  return aiClientReply(client, mcpSetCopiesUserTag, request);
}

function renameUserTag(client: ClaimedAiClient, request: RenameUserTagRequest) {
  return aiClientReply(client, mcpRenameUserTag, request);
}

function deleteUserTag(client: ClaimedAiClient, userTagId: string) {
  return aiClientReply(client, mcpDeleteUserTag, { user_tag_id: userTagId });
}

function restoreUserTag(client: ClaimedAiClient, userTagId: string) {
  return aiClientReply(client, mcpRestoreUserTag, { user_tag_id: userTagId });
}

function deletedUserTagsOf(user: TestUser) {
  return userTagsOf(user, { deleted: true });
}

async function copiesWithUserTag(user: TestUser, name: string) {
  return (await collectionCopies(user.client, { limit: 60, user_tags: [name] })).items.map((row) => row.copy_id).toSorted();
}

async function userTagWithCopies(client: ClaimedAiClient, copies: number) {
  const copyIds = await scannedCopies(client.user, angelicCurator, copies);
  const userTag = await createUserTag(client, 'Trade binder');
  return { copyIds, userTag: { user_tag_id: userTag.user_tag_id, name: userTag.name } };
}

describe('mcp_create_user_tag', () => {
  test('an AI client creates a user tag with the trimmed name', async () => {
    const client = await connectedAiClient();

    const created = await createUserTag(client, '  Trade binder ');

    expect(created).toEqual({ user_tag_id: expect.any(String), name: 'Trade binder', created: true });
    expect(await userTagsOf(client.user)).toEqual([{ user_tag_id: created.user_tag_id, name: 'Trade binder', copy_count: 0 }]);
  });

  test('a name that a user tag already has, ignoring case, returns that user tag with created: false and changes nothing', async () => {
    const client = await connectedAiClient();
    const signed = await replyOf(client.user.client, appCreateUserTag, { name: 'Signed' });

    const again = await createUserTag(client, ' SIGNED ');

    expect(again).toEqual({ ...signed, created: false });
    expect(await userTagsOf(client.user)).toEqual([{ ...signed, copy_count: 0 }]);
  });

  test("a deleted user tag's name makes a new user tag", async () => {
    const client = await connectedAiClient();
    const deleted = await createUserTag(client, 'Sell');
    await replyOf(client.user.client, appDeleteUserTag, { user_tag_id: deleted.user_tag_id });

    const created = await createUserTag(client, 'sell');

    expect(created).toEqual({ user_tag_id: expect.any(String), name: 'sell', created: true });
    expect(created.user_tag_id).not.toBe(deleted.user_tag_id);
  });

  test("another user's user tag with the same name does not count", async () => {
    const client = await connectedAiClient();
    await replyOf((await signUpNewUser()).client, appCreateUserTag, { name: 'Signed' });

    expect(await createUserTag(client, 'Signed')).toMatchObject({ name: 'Signed', created: true });
  });

  test.each<[string, object, string | null]>([
    ['a request with no name', {}, 'name'],
    ['a name of only spaces', { name: '   ' }, 'name'],
    ['a name of 65 characters', { name: 'x'.repeat(65) }, 'name'],
    ['a name that is not a string', { name: 7 }, 'name'],
    ['an unknown field', { name: 'Signed', user_tag_id: crypto.randomUUID() }, 'user_tag_id'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    const client = await connectedAiClient();

    expect(await aiClientCall(client, mcpCreateUserTag, request as never)).toMatchObject(refused('invalid_argument', field));
    expect(await userTagsOf(client.user)).toEqual([]);
  });
});

describe('mcp_set_copies_user_tag', () => {
  test('an AI client puts a user tag on copies and takes it off, with the changed copies in the order asked', async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 3);
    const [first, second, untouched] = copyIds as [string, string, string];

    const tagged = await setCopiesUserTag(client, { copy_ids: [second, first], user_tag_id: userTag.user_tag_id, tagged: true });

    expect(tagged).toEqual({ changed: [second, first], skipped: [] });
    expect(await userTagsOnCopy(client.user, first)).toEqual([userTag]);
    expect(await userTagsOnCopy(client.user, untouched)).toEqual([]);
    expect(await copiesWithUserTag(client.user, 'trade binder')).toEqual([first, second].toSorted());
    expect(await userTagsOf(client.user)).toEqual([{ ...userTag, copy_count: 2 }]);

    const takenOff = await setCopiesUserTag(client, { copy_ids: [first], user_tag_id: userTag.user_tag_id, tagged: false });

    expect(takenOff).toEqual({ changed: [first], skipped: [] });
    expect(await userTagsOnCopy(client.user, first)).toEqual([]);
    expect(await copiesWithUserTag(client.user, 'trade binder')).toEqual([second]);
  });

  test('a copy already in the asked state counts as changed, so a retry gives the same answer', async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 2);
    const request = { copy_ids: copyIds, user_tag_id: userTag.user_tag_id, tagged: true };
    const first = await setCopiesUserTag(client, request);

    expect(await setCopiesUserTag(client, request)).toEqual(first);
    expect(first).toEqual({ changed: copyIds, skipped: [] });
    expect(await userTagsOf(client.user)).toEqual([{ ...userTag, copy_count: 2 }]);

    const takeOffRequest = { ...request, tagged: false };
    expect(await setCopiesUserTag(client, takeOffRequest)).toEqual(first);
    expect(await setCopiesUserTag(client, takeOffRequest)).toEqual(first);
    expect(await userTagsOf(client.user)).toEqual([{ ...userTag, copy_count: 0 }]);
  });

  test("a deleted copy, an unknown copy ID, and another user's copy are skipped as missing, and the other copies change", async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 2);
    const [kept, deleted] = copyIds as [string, string];
    await replyOf(client.user.client, deleteCopy, { copy_id: deleted });
    const other = await signUpNewUser();
    const [othersCopy] = (await scannedCopies(other, angelicCurator)) as [string];
    const unknown = crypto.randomUUID();

    const result = await setCopiesUserTag(client, {
      copy_ids: [othersCopy, kept, unknown, deleted],
      user_tag_id: userTag.user_tag_id,
      tagged: true,
    });

    expect(result).toEqual({
      changed: [kept],
      skipped: [
        { copy_id: othersCopy, reason: 'missing' },
        { copy_id: unknown, reason: 'missing' },
        { copy_id: deleted, reason: 'missing' },
      ],
    });
    expect(await userTagsOnCopy(client.user, kept)).toEqual([userTag]);
    expect(await userTagsOnCopy(other, othersCopy)).toEqual([]);
  });

  test('puts a user tag on 100 copies in one call', async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 100);

    const result = await setCopiesUserTag(client, { copy_ids: copyIds, user_tag_id: userTag.user_tag_id, tagged: true });

    expect(result.changed).toHaveLength(100);
    expect(await userTagsOf(client.user)).toEqual([{ ...userTag, copy_count: 100 }]);
  });

  test.each<[string, (copyIds: string[]) => unknown, string]>([
    ['an empty list', () => [], 'copy_ids'],
    ['101 copy IDs', (copyIds) => [...copyIds, ...Array.from({ length: 100 }, () => crypto.randomUUID())], 'copy_ids'],
    ['a list that is not a list', (copyIds) => copyIds[0], 'copy_ids'],
    ['a repeated copy ID', (copyIds) => [copyIds[0], copyIds[1], copyIds[0]], 'copy_ids[2]'],
    ['a repeated copy ID in another case', (copyIds) => [copyIds[0], copyIds[0]!.toUpperCase()], 'copy_ids[1]'],
    ['a copy ID that is not a UUID', (copyIds) => [copyIds[0], 'copy-2'], 'copy_ids[1]'],
  ])('%s is refused with invalid_argument and changes no copy', async (_, copyIdsOf, field) => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 2);

    const refusal = await aiClientCall(client, mcpSetCopiesUserTag, {
      copy_ids: copyIdsOf(copyIds) as never,
      user_tag_id: userTag.user_tag_id,
      tagged: true,
    });

    expect(refusal).toMatchObject(refused('invalid_argument', field));
    expect(await userTagsOf(client.user)).toEqual([{ ...userTag, copy_count: 0 }]);
  });

  test.each<[string, Record<string, unknown>, string]>([
    ['a request with no copy IDs', { user_tag_id: crypto.randomUUID(), tagged: true }, 'copy_ids'],
    ['a request with no user tag ID', { copy_ids: [crypto.randomUUID()], tagged: true }, 'user_tag_id'],
    ['a request with no tagged flag', { copy_ids: [crypto.randomUUID()], user_tag_id: crypto.randomUUID() }, 'tagged'],
    ['a copy_id field', { copy_id: crypto.randomUUID(), user_tag_id: crypto.randomUUID(), tagged: true }, 'copy_id'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    expect(await aiClientCall(await connectedAiClient(), mcpSetCopiesUserTag, request as never)).toMatchObject(refused('invalid_argument', field));
  });

  test.each<[string, (client: ClaimedAiClient) => Promise<string>]>([
    ['an unknown user tag', async () => crypto.randomUUID()],
    ["another user's user tag", async () => (await replyOf((await signUpNewUser()).client, appCreateUserTag, { name: 'Signed' })).user_tag_id],
    [
      'a deleted user tag',
      async (client) => {
        const { user_tag_id } = await createUserTag(client, 'Sell');
        await replyOf(client.user.client, appDeleteUserTag, { user_tag_id });
        return user_tag_id;
      },
    ],
  ])('%s is not_found on user_tag_id and changes no copy', async (_, userTagIdOf) => {
    const client = await connectedAiClient();
    const [copyId] = (await scannedCopies(client.user, angelicCurator)) as [string];

    const refusal = await aiClientCall(client, mcpSetCopiesUserTag, {
      copy_ids: [copyId],
      user_tag_id: await userTagIdOf(client),
      tagged: true,
    });

    expect(refusal).toMatchObject({
      status: 'refused',
      refusal: { code: 'not_found', message: 'user_tag_id is not one of your user tags.', field: 'user_tag_id' },
    });
    expect(await userTagsOnCopy(client.user, copyId)).toEqual([]);
  });
});

describe('mcp_rename_user_tag', () => {
  test('an AI client renames a user tag with the trimmed name, and the user tag keeps its copies', async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 1);
    await setCopiesUserTag(client, { copy_ids: copyIds, user_tag_id: userTag.user_tag_id, tagged: true });

    const renamed = await renameUserTag(client, { user_tag_id: userTag.user_tag_id, name: ' Sell ' });

    expect(renamed).toEqual({ user_tag_id: userTag.user_tag_id, name: 'Sell' });
    expect(await userTagsOf(client.user)).toEqual([{ ...renamed, copy_count: 1 }]);
    expect(await userTagsOnCopy(client.user, copyIds[0]!)).toEqual([renamed]);
  });

  test('renaming a user tag to its own name in another case changes the case', async () => {
    const client = await connectedAiClient();
    const userTag = await createUserTag(client, 'trade binder');

    expect(await renameUserTag(client, { user_tag_id: userTag.user_tag_id, name: 'Trade Binder' })).toEqual({
      user_tag_id: userTag.user_tag_id,
      name: 'Trade Binder',
    });
  });

  test('a name that another user tag has, ignoring case, is refused with user_tag_exists on name', async () => {
    const client = await connectedAiClient();
    await createUserTag(client, 'Signed');
    const sell = await createUserTag(client, 'Sell');

    expect(await aiClientCall(client, mcpRenameUserTag, { user_tag_id: sell.user_tag_id, name: 'SIGNED' })).toMatchObject(refused('user_tag_exists', 'name'));
    expect((await userTagsOf(client.user)).map((row) => row.name)).toEqual(['Sell', 'Signed']);
  });

  test("a deleted user tag's name is free for a rename", async () => {
    const client = await connectedAiClient();
    const deleted = await createUserTag(client, 'Signed');
    await deleteUserTag(client, deleted.user_tag_id);
    const sell = await createUserTag(client, 'Sell');

    expect(await renameUserTag(client, { user_tag_id: sell.user_tag_id, name: 'Signed' })).toEqual({
      user_tag_id: sell.user_tag_id,
      name: 'Signed',
    });
  });

  test.each<[string, (client: ClaimedAiClient) => Promise<string>]>([
    ['an unknown user tag', async () => crypto.randomUUID()],
    ["another user's user tag", async () => (await replyOf((await signUpNewUser()).client, appCreateUserTag, { name: 'Signed' })).user_tag_id],
    [
      'a deleted user tag',
      async (client) => {
        const { user_tag_id } = await createUserTag(client, 'Signed');
        await deleteUserTag(client, user_tag_id);
        return user_tag_id;
      },
    ],
  ])('%s is not_found on user_tag_id', async (_, userTagIdOf) => {
    const client = await connectedAiClient();

    expect(await aiClientCall(client, mcpRenameUserTag, { user_tag_id: await userTagIdOf(client), name: 'Sell' })).toMatchObject(refused('not_found', 'user_tag_id'));
  });

  test.each<[string, (userTagId: string) => object, string]>([
    ['a request with no name', (user_tag_id) => ({ user_tag_id }), 'name'],
    ['a name of only spaces', (user_tag_id) => ({ user_tag_id, name: '  ' }), 'name'],
    ['a name of 65 characters', (user_tag_id) => ({ user_tag_id, name: 'x'.repeat(65) }), 'name'],
    ['a user tag ID that is not a UUID', () => ({ user_tag_id: 'sell', name: 'Sell' }), 'user_tag_id'],
    ['an unknown field', (user_tag_id) => ({ user_tag_id, name: 'Sell', tagged: true }), 'tagged'],
  ])('%s is refused with invalid_argument', async (_, requestOf, field) => {
    const client = await connectedAiClient();
    const userTag = await createUserTag(client, 'Signed');

    expect(await aiClientCall(client, mcpRenameUserTag, requestOf(userTag.user_tag_id) as never)).toMatchObject(refused('invalid_argument', field));
    expect((await userTagsOf(client.user)).map((row) => row.name)).toEqual(['Signed']);
  });
});

describe('mcp_delete_user_tag', () => {
  test('an AI client deletes a user tag, and the result counts the copies that lost it', async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 3);
    const [first, second, takenOff] = copyIds as [string, string, string];
    await setCopiesUserTag(client, { copy_ids: copyIds, user_tag_id: userTag.user_tag_id, tagged: true });
    await setCopiesUserTag(client, { copy_ids: [takenOff], user_tag_id: userTag.user_tag_id, tagged: false });

    const deleted = await deleteUserTag(client, userTag.user_tag_id);

    expect(deleted).toEqual({ user_tag_id: userTag.user_tag_id, changed: true, copy_count: 2 });
    expect(await userTagsOf(client.user)).toEqual([]);
    expect(await userTagsOnCopy(client.user, first)).toEqual([]);
    expect(await userTagsOnCopy(client.user, second)).toEqual([]);
    expect(await deletedUserTagsOf(client.user)).toEqual([{ ...userTag, copy_count: 2 }]);
  });

  test('deleting a deleted user tag changes nothing and returns changed: false with copy_count 0', async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 1);
    await setCopiesUserTag(client, { copy_ids: copyIds, user_tag_id: userTag.user_tag_id, tagged: true });
    await deleteUserTag(client, userTag.user_tag_id);

    expect(await deleteUserTag(client, userTag.user_tag_id)).toEqual({ user_tag_id: userTag.user_tag_id, changed: false, copy_count: 0 });
    expect(await deletedUserTagsOf(client.user)).toEqual([{ ...userTag, copy_count: 1 }]);
  });

  test.each<[string, () => Promise<{ user_tag_id: string; owner?: TestUser }>]>([
    ['an unknown user tag', async () => ({ user_tag_id: crypto.randomUUID() })],
    [
      "another user's user tag",
      async () => {
        const owner = await signUpNewUser();
        return { ...(await replyOf(owner.client, appCreateUserTag, { name: 'Signed' })), owner };
      },
    ],
  ])('%s is not_found on user_tag_id and is left as it was', async (_, userTagOf) => {
    const client = await connectedAiClient();
    const { user_tag_id, owner } = await userTagOf();

    expect(await aiClientCall(client, mcpDeleteUserTag, { user_tag_id })).toMatchObject(refused('not_found', 'user_tag_id'));
    if (owner) {
      expect((await userTagsOf(owner)).map((row) => row.user_tag_id)).toEqual([user_tag_id]);
    }
  });

  test.each<[string, Record<string, unknown>, string]>([
    ['a request with no user tag ID', {}, 'user_tag_id'],
    ['a user tag ID that is not a UUID', { user_tag_id: 'sell' }, 'user_tag_id'],
    ['an unknown field', { user_tag_id: crypto.randomUUID(), name: 'Sell' }, 'name'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    expect(await aiClientCall(await connectedAiClient(), mcpDeleteUserTag, request as never)).toMatchObject(refused('invalid_argument', field));
  });
});

describe('mcp_restore_user_tag', () => {
  test('a restored user tag comes back on exactly the copies it was on when it was deleted', async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 3);
    const [first, second, takenOffBefore] = copyIds as [string, string, string];
    await setCopiesUserTag(client, { copy_ids: copyIds, user_tag_id: userTag.user_tag_id, tagged: true });
    await setCopiesUserTag(client, { copy_ids: [takenOffBefore], user_tag_id: userTag.user_tag_id, tagged: false });
    await deleteUserTag(client, userTag.user_tag_id);

    const restored = await restoreUserTag(client, userTag.user_tag_id);

    expect(restored).toEqual({ ...userTag, changed: true, copy_count: 2 });
    expect(await userTagsOf(client.user)).toEqual([{ ...userTag, copy_count: 2 }]);
    expect(await deletedUserTagsOf(client.user)).toEqual([]);
    expect(await copiesWithUserTag(client.user, 'trade binder')).toEqual([first, second].toSorted());
    expect(await userTagsOnCopy(client.user, takenOffBefore)).toEqual([]);
  });

  test('a user tag deleted by the user in the app can be restored', async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 1);
    await setCopiesUserTag(client, { copy_ids: copyIds, user_tag_id: userTag.user_tag_id, tagged: true });
    await replyOf(client.user.client, appDeleteUserTag, { user_tag_id: userTag.user_tag_id });

    expect(await restoreUserTag(client, userTag.user_tag_id)).toEqual({ ...userTag, changed: true, copy_count: 1 });
    expect(await userTagsOnCopy(client.user, copyIds[0]!)).toEqual([userTag]);
  });

  test("a deleted user tag's copy count leaves out a copy deleted since, and the restore does too", async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 2);
    const [kept, deletedCopy] = copyIds as [string, string];
    await setCopiesUserTag(client, { copy_ids: copyIds, user_tag_id: userTag.user_tag_id, tagged: true });
    await deleteUserTag(client, userTag.user_tag_id);
    await replyOf(client.user.client, deleteCopy, { copy_id: deletedCopy });

    expect(await deletedUserTagsOf(client.user)).toEqual([{ ...userTag, copy_count: 1 }]);
    expect(await restoreUserTag(client, userTag.user_tag_id)).toEqual({ ...userTag, changed: true, copy_count: 1 });
    expect(await copiesWithUserTag(client.user, 'trade binder')).toEqual([kept]);
  });

  test('restoring a user tag that is not deleted changes nothing and returns changed: false with its copy count', async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 2);
    await setCopiesUserTag(client, { copy_ids: copyIds, user_tag_id: userTag.user_tag_id, tagged: true });

    expect(await restoreUserTag(client, userTag.user_tag_id)).toEqual({ ...userTag, changed: false, copy_count: 2 });
  });

  test('restoring a user tag whose name is now taken, ignoring case, is refused with user_tag_exists on user_tag_id', async () => {
    const client = await connectedAiClient();
    const deleted = await createUserTag(client, 'Signed');
    await deleteUserTag(client, deleted.user_tag_id);
    await createUserTag(client, 'SIGNED');

    expect(await aiClientCall(client, mcpRestoreUserTag, { user_tag_id: deleted.user_tag_id })).toMatchObject(refused('user_tag_exists', 'user_tag_id'));
    expect(await deletedUserTagsOf(client.user)).toEqual([{ user_tag_id: deleted.user_tag_id, name: 'Signed', copy_count: 0 }]);
  });

  test.each<[string, () => Promise<string>]>([
    ['an unknown user tag', async () => crypto.randomUUID()],
    [
      "another user's deleted user tag",
      async () => {
        const owner = await signUpNewUser();
        const { user_tag_id } = await replyOf(owner.client, appCreateUserTag, { name: 'Signed' });
        await replyOf(owner.client, appDeleteUserTag, { user_tag_id });
        return user_tag_id;
      },
    ],
  ])('%s is not_found on user_tag_id', async (_, userTagIdOf) => {
    expect(await aiClientCall(await connectedAiClient(), mcpRestoreUserTag, { user_tag_id: await userTagIdOf() })).toMatchObject(refused('not_found', 'user_tag_id'));
  });

  test.each<[string, Record<string, unknown>, string]>([
    ['a request with no user tag ID', {}, 'user_tag_id'],
    ['a user tag ID that is not a UUID', { user_tag_id: 'sell' }, 'user_tag_id'],
    ['an unknown field', { user_tag_id: crypto.randomUUID(), tagged: true }, 'tagged'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    expect(await aiClientCall(await connectedAiClient(), mcpRestoreUserTag, request as never)).toMatchObject(refused('invalid_argument', field));
  });
});

describe('list_user_tags with deleted', () => {
  test('deleted: true lists only deleted user tags, and deleted: false or no deleted lists only the others', async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag: deleted } = await userTagWithCopies(client, 2);
    await setCopiesUserTag(client, { copy_ids: copyIds, user_tag_id: deleted.user_tag_id, tagged: true });
    await deleteUserTag(client, deleted.user_tag_id);
    const kept = await createUserTag(client, 'Trade binder');
    const other = await signUpNewUser();
    const othersUserTag = await replyOf(other.client, appCreateUserTag, { name: 'Signed' });
    await replyOf(other.client, appDeleteUserTag, { user_tag_id: othersUserTag.user_tag_id });

    const keptRow = { user_tag_id: kept.user_tag_id, name: 'Trade binder', copy_count: 0 };
    expect(await deletedUserTagsOf(client.user)).toEqual([{ ...deleted, copy_count: 2 }]);
    expect(await userTagsOf(client.user, { deleted: false })).toEqual([keptRow]);
    expect(await userTagsOf(client.user)).toEqual([keptRow]);
  });

  test('a deleted value that is not a boolean is refused with invalid_argument on deleted', async () => {
    const user = await signUpNewUser();

    const result = await call(user.client, listUserTags, { deleted: 'yes' } as never);

    expect(result).toMatchObject(refused('invalid_argument', 'deleted'));
  });
});

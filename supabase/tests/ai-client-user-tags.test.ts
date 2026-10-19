import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CollectionCopyRow, CopyDetails, CreatedUserTag, CopiesUserTagResult, UserTag, UserTagList } from '../collection';
import type { Json } from '../database.types';
import type { SearchPage } from '../search';
import { aiClientCall, aiClientRefusal, connectedAiClient, type ClaimedAiClient } from './ai-clients';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

function createUserTag(client: ClaimedAiClient, name: unknown) {
  return aiClientCall<CreatedUserTag>(client, 'mcp_create_user_tag', { name });
}

function setCopiesUserTag(client: ClaimedAiClient, request: object) {
  return aiClientCall<CopiesUserTagResult>(client, 'mcp_set_copies_user_tag', request);
}

async function appRequest(user: TestUser, name: string, request: object) {
  const { data, error } = await user.client.rpc(name as 'create_user_tag', { request: request as Json });
  expect(error).toBeNull();
  return data as unknown as UserTag;
}

async function userTagsOf(user: TestUser) {
  const { data, error } = await user.client.rpc('list_user_tags');
  expect(error).toBeNull();
  return (data as unknown as UserTagList).items;
}

async function userTagsOnCopy(user: TestUser, copyId: string) {
  const { data, error } = await user.client.rpc('get_copy', { query: { copy_id: copyId } });
  expect(error).toBeNull();
  return (data as unknown as CopyDetails).user_tags;
}

async function copiesWithUserTag(user: TestUser, name: string) {
  const { data, error } = await user.client.rpc('search_collection', { query: { rows: 'copies', limit: 60, user_tags: [name] } });
  expect(error).toBeNull();
  return (data as unknown as SearchPage<CollectionCopyRow>).items.map((row) => row.copy_id).toSorted();
}

async function scannedCopies(user: TestUser, copies = 1) {
  const scanned = stack(angelicCurator, { copies });
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids;
}

async function userTagWithCopies(client: ClaimedAiClient, copies: number) {
  const copyIds = await scannedCopies(client.user, copies);
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
    const signed = await appRequest(client.user, 'create_user_tag', { name: 'Signed' });

    const again = await createUserTag(client, ' SIGNED ');

    expect(again).toEqual({ ...signed, created: false });
    expect(await userTagsOf(client.user)).toEqual([{ ...signed, copy_count: 0 }]);
  });

  test("a deleted user tag's name makes a new user tag", async () => {
    const client = await connectedAiClient();
    const deleted = await createUserTag(client, 'Sell');
    await appRequest(client.user, 'delete_user_tag', { user_tag_id: deleted.user_tag_id });

    const created = await createUserTag(client, 'sell');

    expect(created).toEqual({ user_tag_id: expect.any(String), name: 'sell', created: true });
    expect(created.user_tag_id).not.toBe(deleted.user_tag_id);
  });

  test("another user's user tag with the same name does not count", async () => {
    const client = await connectedAiClient();
    await appRequest(await signUpNewUser(), 'create_user_tag', { name: 'Signed' });

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

    expect(await aiClientRefusal(client, 'mcp_create_user_tag', request)).toMatchObject({ code: 'invalid_argument', details: field });
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

    const untagged = await setCopiesUserTag(client, { copy_ids: [first], user_tag_id: userTag.user_tag_id, tagged: false });

    expect(untagged).toEqual({ changed: [first], skipped: [] });
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

    const untagRequest = { ...request, tagged: false };
    expect(await setCopiesUserTag(client, untagRequest)).toEqual(first);
    expect(await setCopiesUserTag(client, untagRequest)).toEqual(first);
    expect(await userTagsOf(client.user)).toEqual([{ ...userTag, copy_count: 0 }]);
  });

  test("a deleted copy, an unknown copy ID, and another user's copy are skipped as missing, and the other copies change", async () => {
    const client = await connectedAiClient();
    const { copyIds, userTag } = await userTagWithCopies(client, 2);
    const [kept, deleted] = copyIds as [string, string];
    await appRequest(client.user, 'delete_copy', { copy_id: deleted });
    const other = await signUpNewUser();
    const [othersCopy] = (await scannedCopies(other)) as [string];
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

    const refusal = await aiClientRefusal(client, 'mcp_set_copies_user_tag', {
      copy_ids: copyIdsOf(copyIds),
      user_tag_id: userTag.user_tag_id,
      tagged: true,
    });

    expect(refusal).toMatchObject({ code: 'invalid_argument', details: field });
    expect(await userTagsOf(client.user)).toEqual([{ ...userTag, copy_count: 0 }]);
  });

  test.each<[string, Record<string, unknown>, string]>([
    ['a request with no copy IDs', { user_tag_id: crypto.randomUUID(), tagged: true }, 'copy_ids'],
    ['a request with no user tag ID', { copy_ids: [crypto.randomUUID()], tagged: true }, 'user_tag_id'],
    ['a request with no tagged flag', { copy_ids: [crypto.randomUUID()], user_tag_id: crypto.randomUUID() }, 'tagged'],
    ['a copy_id field', { copy_id: crypto.randomUUID(), user_tag_id: crypto.randomUUID(), tagged: true }, 'copy_id'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    expect(await aiClientRefusal(await connectedAiClient(), 'mcp_set_copies_user_tag', request)).toMatchObject({
      code: 'invalid_argument',
      details: field,
    });
  });

  test.each<[string, (client: ClaimedAiClient) => Promise<string>]>([
    ['an unknown user tag', async () => crypto.randomUUID()],
    ["another user's user tag", async () => (await appRequest(await signUpNewUser(), 'create_user_tag', { name: 'Signed' })).user_tag_id],
    [
      'a deleted user tag',
      async (client) => {
        const { user_tag_id } = await createUserTag(client, 'Sell');
        await appRequest(client.user, 'delete_user_tag', { user_tag_id });
        return user_tag_id;
      },
    ],
  ])('%s is not_found on user_tag_id and changes no copy', async (_, userTagIdOf) => {
    const client = await connectedAiClient();
    const [copyId] = (await scannedCopies(client.user)) as [string];

    const refusal = await aiClientRefusal(client, 'mcp_set_copies_user_tag', {
      copy_ids: [copyId],
      user_tag_id: await userTagIdOf(client),
      tagged: true,
    });

    expect(refusal).toMatchObject({ code: 'not_found', message: 'user_tag_id is not one of your user tags.', details: 'user_tag_id' });
    expect(await userTagsOnCopy(client.user, copyId)).toEqual([]);
  });
});

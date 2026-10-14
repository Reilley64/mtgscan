import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  readUserTagError,
  type CollectionRow,
  type CopyDetails,
  type CopyUserTagRequest,
  type UserTag,
  type UserTagList,
} from '../collection';
import type { Json } from '../database.types';
import type { SearchPage } from '../search';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function createUserTag(client: AppClient, request: unknown) {
  const { data, error } = await client.rpc('create_user_tag', { request: request as Json });
  return { userTag: data as unknown as UserTag | null, error: error && readUserTagError(error) };
}

async function created(user: TestUser, name: string) {
  const { userTag, error } = await createUserTag(user.client, { name });
  expect(error).toBeNull();
  return userTag!;
}

async function setCopyUserTag(client: AppClient, request: CopyUserTagRequest | Record<string, unknown>) {
  const { error } = await client.rpc('set_copy_user_tag', { request: request as Json });
  return error && readUserTagError(error);
}

async function tagged(user: TestUser, copyId: string, userTag: UserTag, isTagged = true) {
  expect(await setCopyUserTag(user.client, { copy_id: copyId, user_tag_id: userTag.user_tag_id, tagged: isTagged })).toBeNull();
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

async function scannedCopies(user: TestUser, cardPrintingId: string, copies = 1) {
  const scanned = stack(cardPrintingId, { copies });
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids;
}

async function collectionEntriesOf(user: TestUser) {
  const { data, error } = await user.client.rpc('search_collection', { query: { limit: 50 } });
  expect(error).toBeNull();
  return (data as unknown as SearchPage<CollectionRow>).items;
}

describe('creating a user tag', () => {
  test('creates a user tag with the trimmed name as typed', async () => {
    const user = await signUpNewUser();

    const userTag = await created(user, '  Trade binder ');

    expect(userTag).toEqual({ user_tag_id: expect.any(String), name: 'Trade binder' });
    expect(await userTagsOf(user)).toEqual([{ ...userTag, copy_count: 0 }]);
  });

  test('a name of 64 characters is kept', async () => {
    const user = await signUpNewUser();

    expect((await created(user, 'x'.repeat(64))).name).toHaveLength(64);
  });

  test('a name that matches a user tag ignoring case is refused with user_tag_exists on name', async () => {
    const user = await signUpNewUser();
    await created(user, 'Signed');

    const { userTag, error } = await createUserTag(user.client, { name: ' signed' });

    expect(userTag).toBeNull();
    expect(error).toMatchObject({ code: 'user_tag_exists', field: 'name' });
    expect((await userTagsOf(user)).map((row) => row.name)).toEqual(['Signed']);
  });

  test('two users can each have a user tag with the same name', async () => {
    const [first, second] = await Promise.all([signUpNewUser(), signUpNewUser()]);

    await created(first, 'Signed');

    expect((await created(second, 'signed')).name).toBe('signed');
  });

  test.each<[string, unknown, string | null]>([
    ['a request that is not an object', [], null],
    ['a request with no name', {}, 'name'],
    ['an empty name', { name: '' }, 'name'],
    ['a name of only spaces', { name: '   ' }, 'name'],
    ['a name of 65 characters', { name: 'x'.repeat(65) }, 'name'],
    ['a name that is not a string', { name: 7 }, 'name'],
    ['an unknown field', { name: 'Signed', copy_id: crypto.randomUUID() }, 'copy_id'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    const user = await signUpNewUser();

    const { userTag, error } = await createUserTag(user.client, request);

    expect(userTag).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
    expect(await userTagsOf(user)).toEqual([]);
  });
});

describe('putting a user tag on a copy', () => {
  test('tags and untags one copy, and doing it twice changes nothing', async () => {
    const [copyId, otherCopyId] = (await scannedCopies(alice, angelicCurator, 2)) as [string, string];
    const signed = await created(alice, `Signed ${crypto.randomUUID()}`);

    await tagged(alice, copyId, signed);
    await tagged(alice, copyId, signed);

    expect(await userTagsOnCopy(alice, copyId)).toEqual([signed]);
    expect(await userTagsOnCopy(alice, otherCopyId)).toEqual([]);

    await tagged(alice, copyId, signed, false);
    await tagged(alice, copyId, signed, false);

    expect(await userTagsOnCopy(alice, copyId)).toEqual([]);
  });

  test('the copy read has its user tags sorted by name ignoring case', async () => {
    const user = await signUpNewUser();
    const [copyId] = (await scannedCopies(user, angelicCurator)) as [string];
    const trade = await created(user, 'trade binder');
    const alpha = await created(user, 'Alpha');
    const signed = await created(user, 'Signed');
    for (const userTag of [trade, alpha, signed]) {
      await tagged(user, copyId, userTag);
    }

    expect(await userTagsOnCopy(user, copyId)).toEqual([alpha, signed, trade]);
  });

  test('tagging and untagging change no collection entry', async () => {
    const user = await signUpNewUser();
    const [copyId] = (await scannedCopies(user, angelicCurator, 3)) as [string];
    const signed = await created(user, 'Signed');
    const before = await collectionEntriesOf(user);

    await tagged(user, copyId, signed);
    const whileTagged = await collectionEntriesOf(user);
    await tagged(user, copyId, signed, false);

    expect(whileTagged).toEqual(before);
    expect(await collectionEntriesOf(user)).toEqual(before);
    expect(before.map((entry) => entry.quantity)).toEqual([3]);
  });

  test.each<[string, Record<string, unknown>, string | null]>([
    ['a request with no copy ID', { user_tag_id: crypto.randomUUID(), tagged: true }, 'copy_id'],
    ['a request with no user tag ID', { copy_id: crypto.randomUUID(), tagged: true }, 'user_tag_id'],
    ['a request with no tagged flag', { copy_id: crypto.randomUUID(), user_tag_id: crypto.randomUUID() }, 'tagged'],
    ['a copy ID that is not a UUID', { copy_id: 'copy-1', user_tag_id: crypto.randomUUID(), tagged: true }, 'copy_id'],
    ['a tagged flag that is not true or false', { copy_id: crypto.randomUUID(), user_tag_id: crypto.randomUUID(), tagged: 'yes' }, 'tagged'],
    ['a name', { copy_id: crypto.randomUUID(), user_tag_id: crypto.randomUUID(), tagged: true, name: 'Signed' }, 'name'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    expect(await setCopyUserTag(alice.client, request)).toMatchObject({ code: 'invalid_argument', field });
  });

  test('a copy that is not in the collection is not_found on copy_id', async () => {
    const signed = await created(alice, `Signed ${crypto.randomUUID()}`);

    const error = await setCopyUserTag(alice.client, { copy_id: crypto.randomUUID(), user_tag_id: signed.user_tag_id, tagged: true });

    expect(error).toMatchObject({ code: 'not_found', field: 'copy_id' });
  });

  test('a user tag that does not exist is not_found on user_tag_id', async () => {
    const [copyId] = (await scannedCopies(alice, angelicCurator)) as [string];

    const error = await setCopyUserTag(alice.client, { copy_id: copyId, user_tag_id: crypto.randomUUID(), tagged: true });

    expect(error).toMatchObject({ code: 'not_found', field: 'user_tag_id' });
  });
});

describe('the user tag list', () => {
  test("lists the caller's user tags sorted by name ignoring case, with how many copies have each", async () => {
    const user = await signUpNewUser();
    const curators = (await scannedCopies(user, angelicCurator, 2)) as [string, string];
    const [delver] = (await scannedCopies(user, delverInnistrad)) as [string];
    const trade = await created(user, 'trade binder');
    const signed = await created(user, 'Signed');
    const alpha = await created(user, 'alpha');
    await tagged(user, curators[0], signed);
    await tagged(user, curators[1], signed);
    await tagged(user, delver, signed);
    await tagged(user, delver, trade);

    expect(await userTagsOf(user)).toEqual([
      { ...alpha, copy_count: 0 },
      { ...signed, copy_count: 3 },
      { ...trade, copy_count: 1 },
    ]);
  });

  test('a user with no user tags has an empty list', async () => {
    expect(await userTagsOf(await signUpNewUser())).toEqual([]);
  });

  test('a deleted copy loses its user tag links, and the count drops', async () => {
    const user = await signUpNewUser();
    const [keptCopy, deletedCopy] = (await scannedCopies(user, angelicCurator, 2)) as [string, string];
    const signed = await created(user, 'Signed');
    await tagged(user, keptCopy, signed);
    await tagged(user, deletedCopy, signed);

    const { error } = await secretKeyClient().from('copies').delete().eq('user_id', user.userId).eq('id', deletedCopy);
    expect(error).toBeNull();

    expect(await userTagsOf(user)).toEqual([{ ...signed, copy_count: 1 }]);
    const { data } = await user.client.from('copy_user_tags').select('copy_id');
    expect(data).toEqual([{ copy_id: keptCopy }]);
  });
});

describe('access', () => {
  test("a user cannot see another user's user tags or links", async () => {
    const [copyId] = (await scannedCopies(alice, angelicCurator)) as [string];
    const signed = await created(alice, `Signed ${crypto.randomUUID()}`);
    await tagged(alice, copyId, signed);

    expect((await userTagsOf(bob)).map((row) => row.user_tag_id)).not.toContain(signed.user_tag_id);
    for (const table of ['user_tags', 'copy_user_tags'] as const) {
      const { data, error } = await bob.client.from(table).select('user_id').eq('user_id', alice.userId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  test("a user cannot put another user's user tag on their copy, or their user tag on another user's copy", async () => {
    const [aliceCopy] = (await scannedCopies(alice, angelicCurator)) as [string];
    const [bobCopy] = (await scannedCopies(bob, angelicCurator)) as [string];
    const aliceTag = await created(alice, `Signed ${crypto.randomUUID()}`);
    const bobTag = await created(bob, `Signed ${crypto.randomUUID()}`);

    expect(await setCopyUserTag(bob.client, { copy_id: bobCopy, user_tag_id: aliceTag.user_tag_id, tagged: true })).toMatchObject({
      code: 'not_found',
      field: 'user_tag_id',
    });
    expect(await setCopyUserTag(bob.client, { copy_id: aliceCopy, user_tag_id: bobTag.user_tag_id, tagged: true })).toMatchObject({
      code: 'not_found',
      field: 'copy_id',
    });
    expect(await userTagsOnCopy(alice, aliceCopy)).toEqual([]);
    expect(await userTagsOnCopy(bob, bobCopy)).toEqual([]);
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot create, set, or list user tags', async (_, client) => {
    const calls = [
      client().rpc('create_user_tag', { request: { name: 'Signed' } }),
      client().rpc('set_copy_user_tag', {
        request: { copy_id: crypto.randomUUID(), user_tag_id: crypto.randomUUID(), tagged: true },
      }),
      client().rpc('list_user_tags'),
    ];

    for (const { error } of await Promise.all(calls)) {
      expect(error?.code).toBe(permissionDenied);
    }
  });

  describe.each([
    ['a signed-in user', () => alice.client],
    ['an anonymous caller', () => anonymousClient()],
  ])('direct writes by %s are refused', (_, client) => {
    test('inserting, updating, and deleting user tags and copy user tags is refused', async () => {
      const [copyId] = (await scannedCopies(alice, angelicCurator)) as [string];
      const signed = await created(alice, `Signed ${crypto.randomUUID()}`);
      const userTags = () => client().from('user_tags');
      const links = () => client().from('copy_user_tags');
      const link = { user_id: alice.userId, copy_id: copyId, user_tag_id: signed.user_tag_id };

      expect((await userTags().insert({ user_id: alice.userId, name: 'Direct' })).error?.code).toBe(permissionDenied);
      expect((await userTags().update({ name: 'Renamed' }).eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
      expect((await userTags().delete().eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
      expect((await links().insert(link)).error?.code).toBe(permissionDenied);
      expect((await links().update({ copy_id: copyId }).eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
      expect((await links().delete().eq('user_id', alice.userId)).error?.code).toBe(permissionDenied);
    });
  });
});

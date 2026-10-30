import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  createUserTag,
  deleteCopy,
  deleteUserTag,
  listUserTags,
  renameUserTag,
  searchCollection,
  setCopyUserTag,
  type CollectionQuery,
  type UserTag,
} from '../collection';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { collectionCopies } from './collection-pages';
import { call, failed, refused, replyOf } from './database-calls';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { scannedCopies } from './planned-swap-seeds';
import { userTagsOf, userTagsOnCopy } from './user-tag-reads';

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

function created(user: TestUser, name: string) {
  return replyOf(user.client, createUserTag, { name });
}

async function putOnCopy(user: TestUser, copyId: string, userTag: UserTag, tagged = true) {
  await replyOf(user.client, setCopyUserTag, { copy_id: copyId, user_tag_id: userTag.user_tag_id, tagged });
}

async function copyRowsOf(user: TestUser) {
  return (await collectionCopies(user.client, { limit: 120 })).items;
}

async function copiesFound(user: TestUser, query: CollectionQuery) {
  return (await collectionCopies(user.client, { limit: 50, ...query })).items.map((row) => row.copy_id).toSorted();
}

async function linksOf(user: TestUser) {
  const { data, error } = await user.client.from('copy_user_tags').select('copy_id, user_tag_id, deleted_at');
  expect(error).toBeNull();
  return data!;
}

async function userTagRecordsOf(user: TestUser) {
  const { data, error } = await user.client.from('user_tags').select('id, name, deleted_at').order('created_at');
  expect(error).toBeNull();
  return data!;
}

describe('creating a user tag', () => {
  test('creates a user tag with the trimmed name as typed', async () => {
    const user = await signUpNewUser();

    const userTag = await created(user, '  Trade binder ');

    expect(userTag).toEqual({ user_tag_id: expect.any(String), name: 'Trade binder' });
    expect(await userTagsOf(user)).toEqual([{ ...userTag, copy_count: 0 }]);
  });

  test('a name is trimmed of tabs and line breaks too', async () => {
    const user = await signUpNewUser();

    expect((await created(user, '\tSigned\n')).name).toBe('Signed');
  });

  test('a name of 64 characters is kept', async () => {
    const user = await signUpNewUser();

    expect((await created(user, 'x'.repeat(64))).name).toHaveLength(64);
  });

  test('a name that matches a user tag ignoring case is refused with user_tag_exists on name', async () => {
    const user = await signUpNewUser();
    await created(user, 'Signed');

    const result = await call(user.client, createUserTag, { name: ' signed' });

    expect(result).toMatchObject(refused('user_tag_exists', 'name'));
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

    expect(await call(user.client, createUserTag, request as never)).toMatchObject(refused('invalid_argument', field));
    expect(await userTagsOf(user)).toEqual([]);
  });
});

describe('putting a user tag on a copy', () => {
  test('puts a user tag on one copy and takes it off, and doing either twice changes nothing', async () => {
    const [copyId, otherCopyId] = (await scannedCopies(alice, angelicCurator, 2)) as [string, string];
    const signed = await created(alice, `Signed ${crypto.randomUUID()}`);

    await putOnCopy(alice, copyId, signed);
    await putOnCopy(alice, copyId, signed);

    expect(await userTagsOnCopy(alice, copyId)).toEqual([signed]);
    expect(await userTagsOnCopy(alice, otherCopyId)).toEqual([]);

    await putOnCopy(alice, copyId, signed, false);
    await putOnCopy(alice, copyId, signed, false);

    expect(await userTagsOnCopy(alice, copyId)).toEqual([]);
  });

  test('taking a user tag off a copy keeps the link marked deleted, and putting it back reuses the same link', async () => {
    const user = await signUpNewUser();
    const [copyId] = (await scannedCopies(user, angelicCurator)) as [string];
    const signed = await created(user, 'Signed');
    await putOnCopy(user, copyId, signed);

    await putOnCopy(user, copyId, signed, false);

    expect(await linksOf(user)).toEqual([{ copy_id: copyId, user_tag_id: signed.user_tag_id, deleted_at: expect.any(String) }]);
    expect(await userTagsOnCopy(user, copyId)).toEqual([]);
    expect(await userTagsOf(user)).toEqual([{ ...signed, copy_count: 0 }]);

    await putOnCopy(user, copyId, signed);

    expect(await linksOf(user)).toEqual([{ copy_id: copyId, user_tag_id: signed.user_tag_id, deleted_at: null }]);
    expect(await userTagsOnCopy(user, copyId)).toEqual([signed]);
    expect(await userTagsOf(user)).toEqual([{ ...signed, copy_count: 1 }]);
  });

  test('a user tag chip in collection search leaves out copies that the user tag was taken off', async () => {
    const user = await signUpNewUser();
    const [keptCopy, takenOffCopy] = (await scannedCopies(user, angelicCurator, 2)) as [string, string];
    const signed = await created(user, 'Signed');
    await putOnCopy(user, keptCopy, signed);
    await putOnCopy(user, takenOffCopy, signed);

    await putOnCopy(user, takenOffCopy, signed, false);

    expect(await copiesFound(user, { user_tags: ['signed'] })).toEqual([keptCopy]);
    expect(await copiesFound(user, { user_tags_exclude: ['signed'] })).toEqual([takenOffCopy]);
  });

  test('the copy read has its user tags sorted by name ignoring case', async () => {
    const user = await signUpNewUser();
    const [copyId] = (await scannedCopies(user, angelicCurator)) as [string];
    const trade = await created(user, 'trade binder');
    const alpha = await created(user, 'Alpha');
    const signed = await created(user, 'Signed');
    for (const userTag of [trade, alpha, signed]) {
      await putOnCopy(user, copyId, userTag);
    }

    expect(await userTagsOnCopy(user, copyId)).toEqual([alpha, signed, trade]);
  });

  test('putting a user tag on a copy and taking it off change no copy row', async () => {
    const user = await signUpNewUser();
    const [copyId] = (await scannedCopies(user, angelicCurator, 3)) as [string];
    const signed = await created(user, 'Signed');
    const before = await copyRowsOf(user);

    await putOnCopy(user, copyId, signed);
    const whileTagged = await copyRowsOf(user);
    await putOnCopy(user, copyId, signed, false);

    expect(whileTagged).toEqual(before);
    expect(await copyRowsOf(user)).toEqual(before);
    expect(before).toHaveLength(3);
  });

  test.each<[string, Record<string, unknown>, string | null]>([
    ['a request with no copy ID', { user_tag_id: crypto.randomUUID(), tagged: true }, 'copy_id'],
    ['a request with no user tag ID', { copy_id: crypto.randomUUID(), tagged: true }, 'user_tag_id'],
    ['a request with no tagged flag', { copy_id: crypto.randomUUID(), user_tag_id: crypto.randomUUID() }, 'tagged'],
    ['a copy ID that is not a UUID', { copy_id: 'copy-1', user_tag_id: crypto.randomUUID(), tagged: true }, 'copy_id'],
    ['a tagged flag that is not true or false', { copy_id: crypto.randomUUID(), user_tag_id: crypto.randomUUID(), tagged: 'yes' }, 'tagged'],
    ['a name', { copy_id: crypto.randomUUID(), user_tag_id: crypto.randomUUID(), tagged: true, name: 'Signed' }, 'name'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    expect(await call(alice.client, setCopyUserTag, request as never)).toMatchObject(refused('invalid_argument', field));
  });

  test('a copy that is not in the collection is not_found on copy_id', async () => {
    const signed = await created(alice, `Signed ${crypto.randomUUID()}`);

    const result = await call(alice.client, setCopyUserTag, { copy_id: crypto.randomUUID(), user_tag_id: signed.user_tag_id, tagged: true });

    expect(result).toMatchObject(refused('not_found', 'copy_id'));
  });

  test('a user tag that does not exist is not_found on user_tag_id', async () => {
    const [copyId] = (await scannedCopies(alice, angelicCurator)) as [string];

    const result = await call(alice.client, setCopyUserTag, { copy_id: copyId, user_tag_id: crypto.randomUUID(), tagged: true });

    expect(result).toMatchObject(refused('not_found', 'user_tag_id'));
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
    await putOnCopy(user, curators[0], signed);
    await putOnCopy(user, curators[1], signed);
    await putOnCopy(user, delver, signed);
    await putOnCopy(user, delver, trade);

    expect(await userTagsOf(user)).toEqual([
      { ...alpha, copy_count: 0 },
      { ...signed, copy_count: 3 },
      { ...trade, copy_count: 1 },
    ]);
  });

  test('a user with no user tags has an empty list', async () => {
    expect(await userTagsOf(await signUpNewUser())).toEqual([]);
  });

  test('an unknown field in the query is refused with invalid_argument', async () => {
    const result = await call(alice.client, listUserTags, { name: 'Signed' } as never);

    expect(result).toMatchObject(refused('invalid_argument', 'name'));
  });

  test('deleting a copy removes its user tag links, and the count drops', async () => {
    const user = await signUpNewUser();
    const [keptCopy, deletedCopy] = (await scannedCopies(user, angelicCurator, 2)) as [string, string];
    const signed = await created(user, 'Signed');
    await putOnCopy(user, keptCopy, signed);
    await putOnCopy(user, deletedCopy, signed);

    await replyOf(user.client, deleteCopy, { copy_id: deletedCopy });

    expect(await userTagsOf(user)).toEqual([{ ...signed, copy_count: 1 }]);
    const { data } = await user.client.from('copy_user_tags').select('copy_id');
    expect(data).toEqual([{ copy_id: keptCopy }]);
  });

  test('deleting a copy removes its deleted links and the links of its deleted user tags too', async () => {
    const user = await signUpNewUser();
    const [copyId] = (await scannedCopies(user, angelicCurator)) as [string];
    const signed = await created(user, 'Signed');
    const trade = await created(user, 'Trade binder');
    await putOnCopy(user, copyId, signed);
    await putOnCopy(user, copyId, signed, false);
    await putOnCopy(user, copyId, trade);
    expect(await call(user.client, deleteUserTag, { user_tag_id: trade.user_tag_id })).toEqual({ status: 'replied', reply: null });

    await replyOf(user.client, deleteCopy, { copy_id: copyId });

    expect(await linksOf(user)).toEqual([]);
  });
});

describe('renaming a user tag', () => {
  test('renames a user tag to the trimmed name, keeps its ID, and every copy shows the new name', async () => {
    const user = await signUpNewUser();
    const [copyId, otherCopyId] = (await scannedCopies(user, angelicCurator, 2)) as [string, string];
    const signed = await created(user, 'Signd');
    await putOnCopy(user, copyId, signed);
    await putOnCopy(user, otherCopyId, signed);

    const userTag = await replyOf(user.client, renameUserTag, { user_tag_id: signed.user_tag_id, name: ' Signed ' });

    expect(userTag).toEqual({ user_tag_id: signed.user_tag_id, name: 'Signed' });
    expect(await userTagsOf(user)).toEqual([{ user_tag_id: signed.user_tag_id, name: 'Signed', copy_count: 2 }]);
    expect(await userTagsOnCopy(user, copyId)).toEqual([userTag]);
    expect(await userTagsOnCopy(user, otherCopyId)).toEqual([userTag]);
  });

  test('a user tag can be renamed to its own name in another case', async () => {
    const user = await signUpNewUser();
    const signed = await created(user, 'signed');

    const result = await call(user.client, renameUserTag, { user_tag_id: signed.user_tag_id, name: 'Signed' });

    expect(result).toEqual({ status: 'replied', reply: { user_tag_id: signed.user_tag_id, name: 'Signed' } });
  });

  test('a name that matches another user tag ignoring case is refused with user_tag_exists on name', async () => {
    const user = await signUpNewUser();
    await created(user, 'Signed');
    const trade = await created(user, 'Trade binder');

    const result = await call(user.client, renameUserTag, { user_tag_id: trade.user_tag_id, name: 'SIGNED' });

    expect(result).toMatchObject(refused('user_tag_exists', 'name'));
    expect((await userTagsOf(user)).map((row) => row.name)).toEqual(['Signed', 'Trade binder']);
  });

  test('a user tag that does not exist is not_found on user_tag_id', async () => {
    const result = await call(alice.client, renameUserTag, { user_tag_id: crypto.randomUUID(), name: 'Signed' });

    expect(result).toMatchObject(refused('not_found', 'user_tag_id'));
  });

  test.each<[string, Record<string, unknown> | unknown[], string | null]>([
    ['a request that is not an object', [], null],
    ['a request with no user tag ID', { name: 'Signed' }, 'user_tag_id'],
    ['a request with no name', { user_tag_id: crypto.randomUUID() }, 'name'],
    ['a user tag ID that is not a UUID', { user_tag_id: 'user-tag-1', name: 'Signed' }, 'user_tag_id'],
    ['a name of only spaces', { user_tag_id: crypto.randomUUID(), name: '   ' }, 'name'],
    ['a name of 65 characters', { user_tag_id: crypto.randomUUID(), name: 'x'.repeat(65) }, 'name'],
    ['an unknown field', { user_tag_id: crypto.randomUUID(), name: 'Signed', copy_id: crypto.randomUUID() }, 'copy_id'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    const user = await signUpNewUser();
    const signed = await created(user, 'Signed');

    expect(await call(user.client, renameUserTag, request as never)).toMatchObject(refused('invalid_argument', field));
    expect(await userTagsOf(user)).toEqual([{ ...signed, copy_count: 0 }]);
  });
});

describe('deleting a user tag', () => {
  test('deletes the user tag and takes it off every copy, and changes no copy row', async () => {
    const user = await signUpNewUser();
    const curators = (await scannedCopies(user, angelicCurator, 2)) as [string, string];
    const [delver] = (await scannedCopies(user, delverInnistrad)) as [string];
    const signed = await created(user, 'Signed');
    const trade = await created(user, 'Trade binder');
    for (const copyId of [...curators, delver]) {
      await putOnCopy(user, copyId, signed);
    }
    await putOnCopy(user, delver, trade);
    const before = await copyRowsOf(user);

    expect(await call(user.client, deleteUserTag, { user_tag_id: signed.user_tag_id })).toEqual({ status: 'replied', reply: null });

    expect(await userTagsOf(user)).toEqual([{ ...trade, copy_count: 1 }]);
    expect(await userTagsOnCopy(user, curators[0])).toEqual([]);
    expect(await userTagsOnCopy(user, curators[1])).toEqual([]);
    expect(await userTagsOnCopy(user, delver)).toEqual([trade]);
    expect(await copyRowsOf(user)).toEqual(before);
  });

  test('deleting a user tag keeps it marked deleted and leaves its links as they are', async () => {
    const user = await signUpNewUser();
    const [taggedCopy, takenOffCopy] = (await scannedCopies(user, angelicCurator, 2)) as [string, string];
    const signed = await created(user, 'Signed');
    await putOnCopy(user, taggedCopy, signed);
    await putOnCopy(user, takenOffCopy, signed);
    await putOnCopy(user, takenOffCopy, signed, false);
    const links = await linksOf(user);

    expect(await call(user.client, deleteUserTag, { user_tag_id: signed.user_tag_id })).toEqual({ status: 'replied', reply: null });

    expect(await userTagRecordsOf(user)).toEqual([{ id: signed.user_tag_id, name: 'Signed', deleted_at: expect.any(String) }]);
    expect(await linksOf(user)).toEqual(links);
  });

  test('collection search refuses the name of a deleted user tag as one the user does not have', async () => {
    const user = await signUpNewUser();
    const [copyId] = (await scannedCopies(user, angelicCurator)) as [string];
    const signed = await created(user, 'Signed');
    await putOnCopy(user, copyId, signed);
    expect(await call(user.client, deleteUserTag, { user_tag_id: signed.user_tag_id })).toEqual({ status: 'replied', reply: null });

    for (const field of ['user_tags', 'user_tags_exclude']) {
      const result = await call(user.client, searchCollection, { [field]: ['signed'] });
      expect(result).toMatchObject(refused('invalid_argument', `${field}[0]`));
    }
  });

  test('a user tag chip finds only the copies of the user tag that is not deleted when a deleted one had the same name', async () => {
    const user = await signUpNewUser();
    const [oldCopy, newCopy, otherCopy] = (await scannedCopies(user, angelicCurator, 3)) as [string, string, string];
    const oldSigned = await created(user, 'Signed');
    await putOnCopy(user, oldCopy, oldSigned);
    expect(await call(user.client, deleteUserTag, { user_tag_id: oldSigned.user_tag_id })).toEqual({ status: 'replied', reply: null });
    const newSigned = await created(user, 'signed');
    await putOnCopy(user, newCopy, newSigned);

    expect(await copiesFound(user, { user_tags: ['Signed'] })).toEqual([newCopy]);
    expect(await copiesFound(user, { user_tags_exclude: ['Signed'] })).toEqual([oldCopy, otherCopy].toSorted());
    expect(await userTagsOnCopy(user, oldCopy)).toEqual([]);
    expect(await userTagsOf(user)).toEqual([{ ...newSigned, copy_count: 1 }]);
  });

  test('a deleted user tag is not_found when deleted again, renamed, or put on a copy', async () => {
    const user = await signUpNewUser();
    const [copyId] = (await scannedCopies(user, angelicCurator)) as [string];
    const signed = await created(user, 'Signed');
    expect(await call(user.client, deleteUserTag, { user_tag_id: signed.user_tag_id })).toEqual({ status: 'replied', reply: null });

    const notFound = refused('not_found', 'user_tag_id');
    expect(await call(user.client, deleteUserTag, { user_tag_id: signed.user_tag_id })).toMatchObject(notFound);
    expect(await call(user.client, renameUserTag, { user_tag_id: signed.user_tag_id, name: 'Signed' })).toMatchObject(notFound);
    expect(await call(user.client, setCopyUserTag, { copy_id: copyId, user_tag_id: signed.user_tag_id, tagged: true })).toMatchObject(notFound);
    expect(await call(user.client, setCopyUserTag, { copy_id: copyId, user_tag_id: signed.user_tag_id, tagged: false })).toMatchObject(notFound);
  });

  test('the name of a deleted user tag can be used again by a new user tag or a rename', async () => {
    const user = await signUpNewUser();
    const signed = await created(user, 'Signed');
    const trade = await created(user, 'Trade binder');
    expect(await call(user.client, deleteUserTag, { user_tag_id: signed.user_tag_id })).toEqual({ status: 'replied', reply: null });

    const newSigned = await created(user, 'signed');
    expect(await call(user.client, deleteUserTag, { user_tag_id: newSigned.user_tag_id })).toEqual({ status: 'replied', reply: null });
    const result = await call(user.client, renameUserTag, { user_tag_id: trade.user_tag_id, name: 'SIGNED' });

    expect(newSigned.user_tag_id).not.toBe(signed.user_tag_id);
    expect(newSigned.name).toBe('signed');
    expect(result).toEqual({ status: 'replied', reply: { user_tag_id: trade.user_tag_id, name: 'SIGNED' } });
  });

  test.each<[string, Record<string, unknown> | unknown[], string | null]>([
    ['a request that is not an object', [], null],
    ['a request with no user tag ID', {}, 'user_tag_id'],
    ['a user tag ID that is not a UUID', { user_tag_id: 7 }, 'user_tag_id'],
    ['a name', { user_tag_id: crypto.randomUUID(), name: 'Signed' }, 'name'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    expect(await call(alice.client, deleteUserTag, request as never)).toMatchObject(refused('invalid_argument', field));
  });
});

describe('access', () => {
  test("a user cannot see another user's user tags or links", async () => {
    const [copyId] = (await scannedCopies(alice, angelicCurator)) as [string];
    const signed = await created(alice, `Signed ${crypto.randomUUID()}`);
    await putOnCopy(alice, copyId, signed);

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

    expect(await call(bob.client, setCopyUserTag, { copy_id: bobCopy, user_tag_id: aliceTag.user_tag_id, tagged: true })).toMatchObject(
      refused('not_found', 'user_tag_id'),
    );
    expect(await call(bob.client, setCopyUserTag, { copy_id: aliceCopy, user_tag_id: bobTag.user_tag_id, tagged: true })).toMatchObject(
      refused('not_found', 'copy_id'),
    );
    expect(await userTagsOnCopy(alice, aliceCopy)).toEqual([]);
    expect(await userTagsOnCopy(bob, bobCopy)).toEqual([]);
  });

  test("a user cannot rename or delete another user's user tag", async () => {
    const [copyId] = (await scannedCopies(alice, angelicCurator)) as [string];
    const signed = await created(alice, `Signed ${crypto.randomUUID()}`);
    await putOnCopy(alice, copyId, signed);

    const notFound = refused('not_found', 'user_tag_id');
    expect(await call(bob.client, renameUserTag, { user_tag_id: signed.user_tag_id, name: 'Mine' })).toMatchObject(notFound);
    expect(await call(bob.client, deleteUserTag, { user_tag_id: signed.user_tag_id })).toMatchObject(notFound);
    expect(await userTagsOnCopy(alice, copyId)).toEqual([signed]);
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot create, set, list, rename, or delete user tags', async (_, client) => {
    const calls = [
      call(client(), createUserTag, { name: 'Signed' }),
      call(client(), setCopyUserTag, { copy_id: crypto.randomUUID(), user_tag_id: crypto.randomUUID(), tagged: true }),
      call(client(), listUserTags),
      call(client(), renameUserTag, { user_tag_id: crypto.randomUUID(), name: 'Signed' }),
      call(client(), deleteUserTag, { user_tag_id: crypto.randomUUID() }),
    ];

    for (const result of await Promise.all(calls)) {
      expect(result).toMatchObject(failed(permissionDenied));
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

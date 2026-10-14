import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CollectionCopyRow, CollectionPage } from '../collection';
import type { Json } from '../database.types';
import { readSearchError } from '../search';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';

let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function setCopyProtected(client: AppClient, request: Record<string, unknown> | unknown[]) {
  const { data, error } = await client.rpc('set_copy_protected', { request: request as Json });
  return { result: data, error: error && readSearchError(error) };
}

async function protectedFlags(user: TestUser) {
  const { data, error } = await user.client.rpc('search_collection', { query: { rows: 'copies', limit: 120 } });
  expect(error).toBeNull();
  const { items } = data as unknown as CollectionPage<CollectionCopyRow>;
  return Object.fromEntries(items.map((copy) => [copy.copy_id, copy.protected]));
}

async function scannedCopies(user: TestUser) {
  const curators = stack(angelicCurator, { copies: 2 });
  const delver = stack(delverInnistrad);
  await committed(user, scanBatch([curators, delver]));
  return [...curators.copy_ids, ...delver.copy_ids] as [string, string, string];
}

describe('protecting a copy', () => {
  test('protecting a copy protects only that copy, and returns it', async () => {
    const user = await signUpNewUser();
    const [protectedCopy, otherCurator, delver] = await scannedCopies(user);

    const { result, error } = await setCopyProtected(user.client, { copy_id: protectedCopy, protected: true });

    expect(error).toBeNull();
    expect(result).toEqual({ copy_id: protectedCopy, protected: true });
    expect(await protectedFlags(user)).toEqual({ [protectedCopy]: true, [otherCurator]: false, [delver]: false });
  });

  test('unprotecting a copy unprotects only that copy', async () => {
    const user = await signUpNewUser();
    const [first, second, delver] = await scannedCopies(user);
    for (const copyId of [first, second, delver]) {
      expect((await setCopyProtected(user.client, { copy_id: copyId, protected: true })).error).toBeNull();
    }

    const { result, error } = await setCopyProtected(user.client, { copy_id: second, protected: false });

    expect(error).toBeNull();
    expect(result).toEqual({ copy_id: second, protected: false });
    expect(await protectedFlags(user)).toEqual({ [first]: true, [second]: false, [delver]: true });
  });

  test('protecting a protected copy again changes nothing', async () => {
    const user = await signUpNewUser();
    const [first, second, delver] = await scannedCopies(user);
    await setCopyProtected(user.client, { copy_id: first, protected: true });

    expect((await setCopyProtected(user.client, { copy_id: first, protected: true })).error).toBeNull();

    expect(await protectedFlags(user)).toEqual({ [first]: true, [second]: false, [delver]: false });
  });

  test.each<[string, Record<string, unknown> | unknown[], string | null]>([
    ['a request that is not an object', [], null],
    ['a request with no copy ID', { protected: true }, 'copy_id'],
    ['a request with no protected flag', { copy_id: crypto.randomUUID() }, 'protected'],
    ['a copy ID that is not a UUID', { copy_id: 'copy-1', protected: true }, 'copy_id'],
    ['a protected flag that is not true or false', { copy_id: crypto.randomUUID(), protected: 'yes' }, 'protected'],
    ['an unknown field', { copy_id: crypto.randomUUID(), protected: true, quantity: 1 }, 'quantity'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    const { result, error } = await setCopyProtected(alice.client, request);

    expect(result).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
  });

  test('a copy ID that is not in the collection is not_found', async () => {
    const { error } = await setCopyProtected(alice.client, { copy_id: crypto.randomUUID(), protected: true });

    expect(error).toMatchObject({ code: 'not_found', field: 'copy_id' });
  });
});

describe('access', () => {
  test("another user's copy is not_found and stays as it was", async () => {
    const [copyId] = await scannedCopies(alice);
    const bob = await signUpNewUser();

    const { result, error } = await setCopyProtected(bob.client, { copy_id: copyId, protected: true });

    expect(result).toBeNull();
    expect(error).toMatchObject({ code: 'not_found', field: 'copy_id' });
    expect((await protectedFlags(alice))[copyId]).toBe(false);
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot protect a copy', async (_, client) => {
    const [copyId] = await scannedCopies(alice);

    const { data, error } = await client().rpc('set_copy_protected', { request: { copy_id: copyId, protected: true } });

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });

  test('a user cannot protect a copy by writing to it directly', async () => {
    const [copyId] = await scannedCopies(alice);

    const { error } = await alice.client.from('copies').update({ is_protected: true }).eq('id', copyId);

    expect(error?.code).toBe(permissionDenied);
    expect((await protectedFlags(alice))[copyId]).toBe(false);
  });
});

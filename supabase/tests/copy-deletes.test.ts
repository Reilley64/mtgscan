import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CollectionCopyRow, CollectionPage, CollectionRow, CollectionTotal, DeleteCopyRequest } from '../collection';
import type { Json } from '../database.types';
import { readSearchError, type CardDetails, type CardPrintingsPage, type CatalogRow, type SearchPage } from '../search';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const angelicCuratorCard = 'cca29a9b-794f-4712-8e6c-36ce3da9cb8b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function deleteCopy(client: AppClient, request: DeleteCopyRequest | Record<string, unknown> | unknown[]) {
  const { data, error } = await client.rpc('delete_copy', { request: request as Json });
  return { data, error: error && readSearchError(error) };
}

async function deleted(user: TestUser, copyId: string) {
  const { error } = await deleteCopy(user.client, { copy_id: copyId });
  expect(error).toBeNull();
}

async function scannedCuratorCopyIds(user: TestUser) {
  const curators = stack(angelicCurator, { copies: 2 });
  await committed(user, scanBatch([curators, stack(delverInnistrad)]));
  return curators.copy_ids as [string, string];
}

async function searchedRows<Row>(user: TestUser, rows: 'copies' | 'entries') {
  const { data, error } = await user.client.rpc('search_collection', { query: { rows } });
  expect(error).toBeNull();
  return (data as unknown as CollectionPage<Row>).items;
}

async function copyIdsInTheCollection(user: TestUser) {
  return (await searchedRows<CollectionCopyRow>(user, 'copies')).map((row) => row.copy_id).toSorted();
}

async function collectionTotal(user: TestUser) {
  const { data, error } = await user.client.rpc('get_collection_total', { query: {} });
  expect(error).toBeNull();
  return data as unknown as CollectionTotal;
}

describe('deleting a copy', () => {
  let alice: TestUser;
  let deletedCopyId: string;
  let keptCopyId: string;
  let delverCopyId: string;
  let totalBefore: CollectionTotal;

  beforeAll(async () => {
    alice = await signUpNewUser();
    [deletedCopyId, keptCopyId] = await scannedCuratorCopyIds(alice);
    delverCopyId = (await copyIdsInTheCollection(alice)).find((id) => id !== deletedCopyId && id !== keptCopyId)!;
    totalBefore = await collectionTotal(alice);
    await deleted(alice, deletedCopyId);
  });

  test('the copy is gone from collection search, and the other copies stay', async () => {
    expect(await copyIdsInTheCollection(alice)).toEqual([keptCopyId, delverCopyId].toSorted());
    const entries = await searchedRows<CollectionRow>(alice, 'entries');
    expect(entries.map((row) => [row.name, row.quantity]).toSorted()).toEqual([
      ['Angelic Curator', 1],
      ['Delver of Secrets // Insectile Aberration', 1],
    ]);
  });

  test('the copy read says the copy is not_found', async () => {
    const { error } = await alice.client.rpc('get_copy', { query: { copy_id: deletedCopyId } });

    expect(error && readSearchError(error)).toMatchObject({ code: 'not_found', field: 'copy_id' });
  });

  test('owned quantities count one copy fewer', async () => {
    const cards = await alice.client.rpc('get_cards', { query: { oracle_ids: [angelicCuratorCard] } });
    const printings = await alice.client.rpc('list_card_printings', {
      query: { oracle_id: angelicCuratorCard, owned_only: true },
    });
    const catalog = await alice.client.rpc('search_catalog', { query: { names: ['angelic curator'] } });
    const oneFreeCopy = { quantity: 1, free_quantity: 1, protected_free_quantity: 0 };

    expect((cards.data as unknown as CardDetails).items[0]!.owned).toEqual(oneFreeCopy);
    expect((catalog.data as unknown as SearchPage<CatalogRow>).items[0]!.owned).toEqual(oneFreeCopy);
    expect((printings.data as unknown as CardPrintingsPage).items.map((row) => [row.set, row.owned_quantity])).toEqual([
      ['mh2', 1],
    ]);
  });

  test('the collection total and its coverage drop the copy', async () => {
    const curatorPrice = 0.21;
    expect(totalBefore).toMatchObject({ priced_copies: 3, copies: 3 });
    expect(await collectionTotal(alice)).toMatchObject({
      total: (Number(totalBefore.total) - curatorPrice).toFixed(2),
      priced_copies: 2,
      copies: 2,
    });
  });

  test('the addition and its addition lines stay', async () => {
    const additions = await alice.client.from('collection_additions').select('copy_count');
    const lines = await alice.client.from('collection_addition_lines').select('card_printing_id, quantity').order('quantity');
    const addedCopyIds = await alice.client.from('collection_addition_copies').select('copy_id').eq('copy_id', deletedCopyId);

    expect(additions.data).toEqual([{ copy_count: 3 }]);
    expect(lines.data).toEqual([
      { card_printing_id: delverInnistrad, quantity: 1 },
      { card_printing_id: angelicCurator, quantity: 2 },
    ]);
    expect(addedCopyIds.data).toEqual([{ copy_id: deletedCopyId }]);
  });

  test('deleting the copy again is not_found', async () => {
    const { error } = await deleteCopy(alice.client, { copy_id: deletedCopyId });

    expect(error).toMatchObject({ code: 'not_found', field: 'copy_id' });
  });
});

describe('refused deletes', () => {
  let alice: TestUser;

  beforeAll(async () => {
    alice = await signUpNewUser();
  });

  test.each<[string, Record<string, unknown> | unknown[], string | null]>([
    ['a request that is not an object', [], null],
    ['a request with no copy ID', {}, 'copy_id'],
    ['a copy ID that is not a UUID', { copy_id: 'copy-1' }, 'copy_id'],
    ['an unknown field', { copy_id: crypto.randomUUID(), price_currency: 'USD' }, 'price_currency'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    const { error } = await deleteCopy(alice.client, request);

    expect(error).toMatchObject({ code: 'invalid_argument', field });
  });

  test('a copy ID that is not in the collection is not_found', async () => {
    const { error } = await deleteCopy(alice.client, { copy_id: crypto.randomUUID() });

    expect(error).toMatchObject({ code: 'not_found', field: 'copy_id' });
  });

  test("another user's copy is not_found and stays in their collection", async () => {
    const bob = await signUpNewUser();
    const [bobCopyId] = await scannedCuratorCopyIds(bob);

    const { error } = await deleteCopy(alice.client, { copy_id: bobCopyId });

    expect(error).toMatchObject({ code: 'not_found', field: 'copy_id' });
    expect(await copyIdsInTheCollection(bob)).toContain(bobCopyId);
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot delete a copy', async (_, client) => {
    const [copyId] = await scannedCuratorCopyIds(alice);

    const { error } = await client().rpc('delete_copy', { request: { copy_id: copyId } });

    expect(error?.code).toBe(permissionDenied);
    expect(await copyIdsInTheCollection(alice)).toContain(copyId);
  });
});

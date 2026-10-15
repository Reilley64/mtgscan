import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CopyDetails } from '../collection';
import type { Json } from '../database.types';
import { readDeckError, type CreatedDeck, type Deck, type DeckList, type RemovedDeckCard } from '../decks';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function created(user: TestUser, name: string) {
  const { data, error } = await user.client.rpc('create_deck', { request: { name } });
  expect(error).toBeNull();
  return (data as unknown as CreatedDeck).deck_id;
}

async function scannedCopy(user: TestUser, cardPrintingId = angelicCurator, finish: 'nonfoil' | 'foil' = 'nonfoil') {
  const scanned = stack(cardPrintingId, { finish });
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids[0]!;
}

async function added(user: TestUser, deckId: string, copyId: string) {
  const { error } = await user.client.rpc('add_deck_card', { request: { deck_id: deckId, copy_id: copyId, unprotect: false } });
  expect(error).toBeNull();
}

async function removeDeckCard(client: AppClient, request: unknown) {
  const { data, error } = await client.rpc('remove_deck_card', { request: request as Json });
  return { removed: data as unknown as RemovedDeckCard | null, error: error && readDeckError(error) };
}

async function removed(user: TestUser, copyId: string) {
  const { removed: result, error } = await removeDeckCard(user.client, { copy_id: copyId });
  expect(error).toBeNull();
  return result!;
}

async function deckOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return data as unknown as Deck;
}

async function decksOf(user: TestUser) {
  const { data, error } = await user.client.rpc('list_decks');
  expect(error).toBeNull();
  return (data as unknown as DeckList).items;
}

async function copyOf(user: TestUser, copyId: string) {
  const { data, error } = await user.client.rpc('get_copy', { query: { copy_id: copyId } });
  expect(error).toBeNull();
  return data as unknown as CopyDetails;
}

async function deckChangesOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client
    .from('deck_changes')
    .select('revision, kind, deck_change_lines(copy_id, card_printing_id, finish, place_before, place_after)')
    .eq('deck_id', deckId)
    .order('revision');
  expect(error).toBeNull();
  return data;
}

async function madeCommander(user: TestUser, copyId: string) {
  const { error } = await user.client.rpc('set_deck_commander', { request: { copy_id: copyId, commander: true } });
  expect(error).toBeNull();
}

describe('removing a card from a deck', () => {
  test('takes the copy out of the deck, writes one removed deck change with its line, and raises the revision by one', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user, angelicCurator, 'foil');
    const kept = await scannedCopy(user, delverInnistrad);
    await added(user, deckId, copyId);
    await added(user, deckId, kept);

    expect(await removed(user, copyId)).toEqual({ deck_id: deckId, revision: 3 });

    const deck = await deckOf(user, deckId);
    expect(deck.revision).toBe(3);
    expect(deck.card_count).toBe(1);
    expect(deck.cards.map((card) => card.copy_id)).toEqual([kept]);
    expect((await deckChangesOf(user, deckId))!.at(-1)).toEqual({
      revision: 3,
      kind: 'removed',
      deck_change_lines: [
        { copy_id: copyId, card_printing_id: angelicCurator, finish: 'foil', place_before: 'main', place_after: null },
      ],
    });
  });

  test('removing a commander records the commander as its place before', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user);
    await added(user, deckId, copyId);
    await madeCommander(user, copyId);

    await removed(user, copyId);

    const deck = await deckOf(user, deckId);
    expect(deck.commanders).toEqual([]);
    expect((await deckChangesOf(user, deckId))!.at(-1)?.deck_change_lines).toEqual([
      expect.objectContaining({ copy_id: copyId, place_before: 'commander', place_after: null }),
    ]);
  });

  test('the removed copy is free, so it can be protected or go into another deck', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    const kinnan = await created(user, 'Kinnan');
    const copyId = await scannedCopy(user);
    await added(user, atraxa, copyId);

    await removed(user, copyId);

    expect(await copyOf(user, copyId)).toMatchObject({ free: true, deck: null });
    const { error } = await user.client.rpc('set_copy_protected', { request: { copy_id: copyId, protected: true } });
    expect(error).toBeNull();
    await user.client.rpc('set_copy_protected', { request: { copy_id: copyId, protected: false } });
    await added(user, kinnan, copyId);
    expect((await copyOf(user, copyId)).deck?.deck_id).toBe(kinnan);
  });

  test('removing a card counts as using the deck', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user);
    await added(user, atraxa, copyId);
    await created(user, 'Kinnan');

    await removed(user, copyId);

    expect((await decksOf(user)).map((deck) => deck.name)).toEqual(['Atraxa', 'Kinnan']);
  });

  test('a copy in no deck is refused with copy_not_in_deck, and nothing changes', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    await added(user, deckId, await scannedCopy(user));
    const free = await scannedCopy(user);

    const { removed: result, error } = await removeDeckCard(user.client, { copy_id: free });

    expect(result).toBeNull();
    expect(error).toMatchObject({ code: 'copy_not_in_deck', field: 'copy_id' });
    expect((await deckOf(user, deckId)).revision).toBe(1);
    expect(await deckChangesOf(user, deckId)).toHaveLength(1);
  });

  test('a copy removed twice is refused with copy_not_in_deck the second time', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user);
    await added(user, deckId, copyId);
    await removed(user, copyId);

    const { error } = await removeDeckCard(user.client, { copy_id: copyId });

    expect(error).toMatchObject({ code: 'copy_not_in_deck', field: 'copy_id' });
    expect((await deckOf(user, deckId)).revision).toBe(2);
  });

  test('a copy that does not exist is not_found on copy_id', async () => {
    const user = await signUpNewUser();

    const { error } = await removeDeckCard(user.client, { copy_id: crypto.randomUUID() });

    expect(error).toMatchObject({ code: 'not_found', field: 'copy_id' });
  });

  test.each<[string, (copyId: string) => unknown, string | null]>([
    ['a request that is not an object', () => [], null],
    ['a request with no copy ID', () => ({}), 'copy_id'],
    ['a copy ID that is not a UUID', () => ({ copy_id: 'copy-1' }), 'copy_id'],
    ['an unknown field', (copyId) => ({ copy_id: copyId, deck_id: crypto.randomUUID() }), 'deck_id'],
  ])('%s is refused with invalid_argument, and nothing changes', async (_, request, field) => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user);
    await added(user, deckId, copyId);

    const { error } = await removeDeckCard(user.client, request(copyId));

    expect(error).toMatchObject({ code: 'invalid_argument', field });
    expect((await copyOf(user, copyId)).deck?.deck_id).toBe(deckId);
    expect((await deckOf(user, deckId)).revision).toBe(1);
  });
});

describe('access', () => {
  test("a user cannot remove another user's card from a deck", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const aliceDeck = await created(alice, 'Atraxa');
    const aliceCopy = await scannedCopy(alice);
    await added(alice, aliceDeck, aliceCopy);

    const { error } = await removeDeckCard(bob.client, { copy_id: aliceCopy });

    expect(error).toMatchObject({ code: 'not_found', field: 'copy_id' });
    expect((await copyOf(alice, aliceCopy)).deck?.deck_id).toBe(aliceDeck);
    expect((await deckOf(alice, aliceDeck)).revision).toBe(1);
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot remove a card from a deck', async (_, client) => {
    const { error } = await client().rpc('remove_deck_card', { request: { copy_id: crypto.randomUUID() } });

    expect(error?.code).toBe(permissionDenied);
  });
});

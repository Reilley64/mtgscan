import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { getCopy, setCopyProtected } from '../collection';
import { addDeckCard, createDeck, getDeck, listDecks, removeDeckCard, setDeckCommander } from '../decks';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { call, failed, refused, replyOf } from './database-calls';
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
  return (await replyOf(user.client, createDeck, { name })).deck_id;
}

async function scannedCopy(user: TestUser, cardPrintingId = angelicCurator, finish: 'nonfoil' | 'foil' = 'nonfoil') {
  const scanned = stack(cardPrintingId, { finish });
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids[0]!;
}

async function added(user: TestUser, deckId: string, copyId: string) {
  await replyOf(user.client, addDeckCard, { deck_id: deckId, copy_id: copyId, unprotect: false });
}

async function removed(user: TestUser, copyId: string) {
  return replyOf(user.client, removeDeckCard, { copy_id: copyId });
}

async function deckOf(user: TestUser, deckId: string) {
  return replyOf(user.client, getDeck, { deck_id: deckId });
}

async function decksOf(user: TestUser) {
  return (await replyOf(user.client, listDecks)).items;
}

async function copyOf(user: TestUser, copyId: string) {
  return replyOf(user.client, getCopy, { copy_id: copyId });
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
  await replyOf(user.client, setDeckCommander, { copy_id: copyId, commander: true });
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
    await replyOf(user.client, setCopyProtected, { copy_id: copyId, protected: true });
    await replyOf(user.client, setCopyProtected, { copy_id: copyId, protected: false });
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

    expect(await call(user.client, removeDeckCard, { copy_id: free })).toMatchObject(refused('copy_not_in_deck', 'copy_id'));
    expect((await deckOf(user, deckId)).revision).toBe(1);
    expect(await deckChangesOf(user, deckId)).toHaveLength(1);
  });

  test('a copy removed twice is refused with copy_not_in_deck the second time', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user);
    await added(user, deckId, copyId);
    await removed(user, copyId);

    expect(await call(user.client, removeDeckCard, { copy_id: copyId })).toMatchObject(refused('copy_not_in_deck', 'copy_id'));
    expect((await deckOf(user, deckId)).revision).toBe(2);
  });

  test('a copy that does not exist is not_found on copy_id', async () => {
    const user = await signUpNewUser();

    expect(await call(user.client, removeDeckCard, { copy_id: crypto.randomUUID() })).toMatchObject(refused('not_found', 'copy_id'));
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

    expect(await call(user.client, removeDeckCard, request(copyId) as never)).toMatchObject(refused('invalid_argument', field));
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

    expect(await call(bob.client, removeDeckCard, { copy_id: aliceCopy })).toMatchObject(refused('not_found', 'copy_id'));
    expect((await copyOf(alice, aliceCopy)).deck?.deck_id).toBe(aliceDeck);
    expect((await deckOf(alice, aliceDeck)).revision).toBe(1);
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot remove a card from a deck', async (_, client) => {
    expect(await call(client(), removeDeckCard, { copy_id: crypto.randomUUID() })).toMatchObject(failed(permissionDenied));
  });
});

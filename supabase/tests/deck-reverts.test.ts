import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import { readDeckError, type CreatedDeck, type Deck, type DeckChangePage, type RevertPreview, type RevertedDeckChanges } from '../decks';
import { basicLand, catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const [forest, wastes] = ['Forest', 'Wastes'].map((name) => basicLand(name).oracle_id) as [string, string];

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function call(user: TestUser, name: string, request: Record<string, unknown>) {
  const { error } = await user.client.rpc(name as 'create_deck', { request: request as Json });
  expect(error).toBeNull();
}

async function created(user: TestUser, name = 'Atraxa') {
  const { data, error } = await user.client.rpc('create_deck', { request: { name } });
  expect(error).toBeNull();
  return (data as unknown as CreatedDeck).deck_id;
}

async function scannedCopy(user: TestUser, cardPrintingId = angelicCurator) {
  const scanned = stack(cardPrintingId);
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids[0]!;
}

const added = (user: TestUser, deckId: string, copyId: string) =>
  call(user, 'add_deck_card', { deck_id: deckId, copy_id: copyId, unprotect: false });
const removed = (user: TestUser, copyId: string) => call(user, 'remove_deck_card', { copy_id: copyId });
const madeCommander = (user: TestUser, copyId: string, commander = true) =>
  call(user, 'set_deck_commander', { copy_id: copyId, commander });
const basicLandsSet = (user: TestUser, deckId: string, counts: { oracle_id: string; count: number }[]) =>
  call(user, 'set_basic_lands', { deck_id: deckId, counts });

async function deckOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return data as unknown as Deck;
}

async function changesOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('list_deck_changes', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return (data as unknown as DeckChangePage).items;
}

async function changeAt(user: TestUser, deckId: string, revision: number) {
  return (await changesOf(user, deckId)).find((change) => change.revision === revision)!.deck_change_id;
}

async function previewRevert(client: AppClient, query: unknown) {
  const { data, error } = await client.rpc('preview_revert', { query: query as Json });
  return { preview: data as unknown as RevertPreview | null, error: error && readDeckError(error) };
}

async function revertDeckChanges(client: AppClient, request: unknown) {
  const { data, error } = await client.rpc('revert_deck_changes', { request: request as Json });
  return { reverted: data as unknown as RevertedDeckChanges | null, error: error && readDeckError(error) };
}

async function previewOf(user: TestUser, deckId: string, deckChangeId: string) {
  const { preview, error } = await previewRevert(user.client, { deck_id: deckId, deck_change_id: deckChangeId });
  expect(error).toBeNull();
  return preview!;
}

async function revertedFrom(user: TestUser, deckId: string, revision: number, unprotect = false) {
  const deckChangeId = await changeAt(user, deckId, revision);
  const { revision: expected } = await previewOf(user, deckId, deckChangeId);
  return revertDeckChanges(user.client, { deck_id: deckId, deck_change_id: deckChangeId, expected_revision: expected, unprotect });
}

function placesOf(deck: Deck) {
  return deck.cards.map((card) => [card.copy_id, card.role]);
}

describe('reverting deck changes', () => {
  test('a revert undoes the deck change and every later one as one revert deck change, and marks them reverted', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const [curator, delver, rift] = [await scannedCopy(user), await scannedCopy(user, delverInnistrad), await scannedCopy(user)];
    await added(user, deckId, curator);
    await added(user, deckId, delver);
    await madeCommander(user, curator);
    await added(user, deckId, rift);

    const { reverted, error } = await revertedFrom(user, deckId, 2);

    expect(error).toBeNull();
    expect(reverted).toEqual({ deck_id: deckId, revision: 5 });
    expect(placesOf(await deckOf(user, deckId))).toEqual([[curator, 'main']]);
    const changes = await changesOf(user, deckId);
    expect(changes.map((change) => [change.revision, change.kind, change.reverted])).toEqual([
      [5, 'revert', false],
      [4, 'added', true],
      [3, 'made_commander', true],
      [2, 'added', true],
      [1, 'added', false],
    ]);
    expect(changes[0]!.lines.map((line) => line.kind === 'copy' && [line.copy_id, line.place_before, line.place_after])).toEqual(
      expect.arrayContaining([
        [curator, 'commander', 'main'],
        [delver, 'main', null],
        [rift, 'main', null],
      ]),
    );
    expect(changes[0]!.lines).toHaveLength(3);
  });

  test('a revert marks only the deck changes in its range that no revert undid yet', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    for (const copyId of [await scannedCopy(user), await scannedCopy(user), await scannedCopy(user)]) {
      await added(user, deckId, copyId);
    }
    expect((await revertedFrom(user, deckId, 3)).error).toBeNull();

    expect((await revertedFrom(user, deckId, 2)).error).toBeNull();

    const { data } = await user.client.from('deck_changes').select('revision, id, reverted_by').eq('deck_id', deckId).order('revision');
    const idAt = (revision: number) => data!.find((change) => change.revision === revision)!.id;
    expect(data!.map((change) => [change.revision, change.reverted_by])).toEqual([
      [1, null],
      [2, idAt(5)],
      [3, idAt(4)],
      [4, idAt(5)],
      [5, null],
    ]);
  });

  test('a revert of a revert puts the deck back', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const curator = await scannedCopy(user);
    await added(user, deckId, curator);
    await madeCommander(user, curator);
    await removed(user, curator);
    expect((await revertedFrom(user, deckId, 3)).error).toBeNull();
    expect(placesOf(await deckOf(user, deckId))).toEqual([[curator, 'commander']]);

    const { reverted, error } = await revertedFrom(user, deckId, 4);

    expect(error).toBeNull();
    expect(reverted!.revision).toBe(5);
    expect((await deckOf(user, deckId)).cards).toEqual([]);
    expect((await changesOf(user, deckId)).map((change) => [change.kind, change.reverted])).toEqual([
      ['revert', false],
      ['revert', true],
      ['removed', true],
      ['made_commander', false],
      ['added', false],
    ]);
  });

  test('a revert of moving a commander to the main deck makes it a commander again', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const curator = await scannedCopy(user);
    await added(user, deckId, curator);
    await madeCommander(user, curator);
    await madeCommander(user, curator, false);

    expect((await revertedFrom(user, deckId, 3)).error).toBeNull();

    const deck = await deckOf(user, deckId);
    expect(placesOf(deck)).toEqual([[curator, 'commander']]);
    expect(deck.commanders.map((commander) => commander.copy_id)).toEqual([curator]);
  });

  test('a revert puts basic land counts back', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    await basicLandsSet(user, deckId, [{ oracle_id: forest, count: 8 }]);
    await basicLandsSet(user, deckId, [
      { oracle_id: forest, count: 6 },
      { oracle_id: wastes, count: 1 },
    ]);

    expect((await revertedFrom(user, deckId, 2)).error).toBeNull();

    const counts = (deck: Deck) => Object.fromEntries(deck.basic_lands.filter((land) => land.count > 0).map((land) => [land.name, land.count]));
    expect(counts(await deckOf(user, deckId))).toEqual({ Forest: 8 });
    const [revert] = await changesOf(user, deckId);
    expect(revert!.lines).toEqual([
      expect.objectContaining({ kind: 'basic_land', name: 'Forest', count_before: 6, count_after: 8 }),
      expect.objectContaining({ kind: 'basic_land', name: 'Wastes', count_before: 1, count_after: 0 }),
    ]);

    expect((await revertedFrom(user, deckId, 1)).error).toBeNull();
    expect(counts(await deckOf(user, deckId))).toEqual({});
    expect((await deckOf(user, deckId)).card_count).toBe(0);
  });

  test('a copy that must come back and was deleted blocks the revert with revert_blocked naming the card', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const curator = await scannedCopy(user);
    await added(user, deckId, curator);
    await removed(user, curator);
    await call(user, 'delete_copy', { copy_id: curator });
    const deckChangeId = await changeAt(user, deckId, 2);

    const preview = await previewOf(user, deckId, deckChangeId);
    const { error } = await revertDeckChanges(user.client, { deck_id: deckId, deck_change_id: deckChangeId, expected_revision: 2, unprotect: true });

    expect(preview.blocks).toEqual([{ copy_id: curator, name: 'Angelic Curator', deck: null }]);
    expect(error).toMatchObject({ code: 'revert_blocked', message: 'Angelic Curator is no longer in your collection.', field: 'deck_change_id' });
    expect((await deckOf(user, deckId)).revision).toBe(2);
    expect((await changesOf(user, deckId)).some((change) => change.reverted)).toBe(false);
  });

  test('a copy that must come back and is in another deck blocks the revert with revert_blocked naming the card and the deck', async () => {
    const user = await signUpNewUser();
    const [atraxa, kinnan] = [await created(user, 'Atraxa'), await created(user, 'Kinnan')];
    const curator = await scannedCopy(user);
    await added(user, atraxa, curator);
    await removed(user, curator);
    await added(user, kinnan, curator);
    const deckChangeId = await changeAt(user, atraxa, 2);

    const preview = await previewOf(user, atraxa, deckChangeId);
    const { error } = await revertDeckChanges(user.client, { deck_id: atraxa, deck_change_id: deckChangeId, expected_revision: 2, unprotect: false });

    expect(preview.blocks).toEqual([{ copy_id: curator, name: 'Angelic Curator', deck: { deck_id: kinnan, name: 'Kinnan' } }]);
    expect(error).toMatchObject({ code: 'revert_blocked', message: 'Angelic Curator is in Kinnan.', field: 'deck_change_id' });
    expect(placesOf(await deckOf(user, kinnan))).toEqual([[curator, 'main']]);
    expect((await deckOf(user, atraxa)).cards).toEqual([]);
  });

  test('a copy that goes out of the deck never blocks the revert, even when it is deleted', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const [curator, delver] = [await scannedCopy(user), await scannedCopy(user, delverInnistrad)];
    await added(user, deckId, curator);
    await added(user, deckId, delver);
    await call(user, 'delete_copy', { copy_id: curator });

    const { error } = await revertedFrom(user, deckId, 1);

    expect(error).toBeNull();
    expect((await deckOf(user, deckId)).cards).toEqual([]);
  });

  test('a protected copy that comes back needs unprotect, otherwise copy_protected', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const curator = await scannedCopy(user);
    await added(user, deckId, curator);
    await removed(user, curator);
    await call(user, 'set_copy_protected', { copy_id: curator, protected: true });
    const deckChangeId = await changeAt(user, deckId, 2);
    const request = { deck_id: deckId, deck_change_id: deckChangeId, expected_revision: 2 };

    const preview = await previewOf(user, deckId, deckChangeId);
    const refused = await revertDeckChanges(user.client, { ...request, unprotect: false });

    expect(preview.protected_copies).toEqual([{ copy_id: curator, name: 'Angelic Curator' }]);
    expect(preview.blocks).toEqual([]);
    expect(refused.error).toMatchObject({ code: 'copy_protected', field: 'unprotect' });
    expect((await deckOf(user, deckId)).revision).toBe(2);

    expect((await revertDeckChanges(user.client, { ...request, unprotect: true })).error).toBeNull();

    const deck = await deckOf(user, deckId);
    expect(placesOf(deck)).toEqual([[curator, 'main']]);
    expect(deck.cards[0]!.protected).toBe(false);
  });

  test('a stale expected_revision is refused with stale_revision and changes nothing', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const [curator, delver] = [await scannedCopy(user), await scannedCopy(user, delverInnistrad)];
    await added(user, deckId, curator);
    const deckChangeId = await changeAt(user, deckId, 1);
    const { revision } = await previewOf(user, deckId, deckChangeId);
    await added(user, deckId, delver);

    const { error } = await revertDeckChanges(user.client, { deck_id: deckId, deck_change_id: deckChangeId, expected_revision: revision, unprotect: false });

    expect(revision).toBe(1);
    expect(error).toMatchObject({ code: 'stale_revision', field: 'expected_revision' });
    expect((await deckOf(user, deckId)).cards).toHaveLength(2);
    expect((await previewOf(user, deckId, deckChangeId)).revision).toBe(2);
  });

  test('the preview shows the lines that the revert writes', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const [curator, delver] = [await scannedCopy(user), await scannedCopy(user, delverInnistrad)];
    await added(user, deckId, curator);
    await basicLandsSet(user, deckId, [{ oracle_id: forest, count: 3 }]);
    await removed(user, curator);
    await added(user, deckId, delver);
    const deckChangeId = await changeAt(user, deckId, 2);

    const preview = await previewOf(user, deckId, deckChangeId);
    const { reverted } = await revertDeckChanges(user.client, { deck_id: deckId, deck_change_id: deckChangeId, expected_revision: preview.revision, unprotect: false });

    expect(preview).toEqual({
      revision: 4,
      lines: [
        expect.objectContaining({ kind: 'copy', copy_id: curator, name: 'Angelic Curator', type_line: 'Creature — Angel Spirit', place_before: null, place_after: 'main' }),
        expect.objectContaining({ kind: 'copy', copy_id: delver, place_before: 'main', place_after: null }),
        expect.objectContaining({ kind: 'basic_land', oracle_id: forest, name: 'Forest', count_before: 3, count_after: 0 }),
      ],
      blocks: [],
      protected_copies: [],
      held_copies: [],
      effect: null,
    });
    expect(reverted!.revision).toBe(5);
    expect((await changesOf(user, deckId))[0]!.lines).toEqual(preview.lines);
  });

  test('the preview changes nothing', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const curator = await scannedCopy(user);
    await added(user, deckId, curator);

    await previewOf(user, deckId, await changeAt(user, deckId, 1));

    const deck = await deckOf(user, deckId);
    expect(deck.revision).toBe(1);
    expect(placesOf(deck)).toEqual([[curator, 'main']]);
  });

  test("a deck change of another deck is not_found on deck_change_id", async () => {
    const user = await signUpNewUser();
    const [atraxa, kinnan] = [await created(user, 'Atraxa'), await created(user, 'Kinnan')];
    await added(user, kinnan, await scannedCopy(user));
    const deckChangeId = await changeAt(user, kinnan, 1);

    const preview = await previewRevert(user.client, { deck_id: atraxa, deck_change_id: deckChangeId });
    const revert = await revertDeckChanges(user.client, { deck_id: atraxa, deck_change_id: deckChangeId, expected_revision: 0, unprotect: false });

    expect(preview.error).toMatchObject({ code: 'not_found', field: 'deck_change_id' });
    expect(revert.error).toMatchObject({ code: 'not_found', field: 'deck_change_id' });
    expect((await deckOf(user, kinnan)).cards).toHaveLength(1);
  });

  test.each<[string, (ids: { deck_id: string; deck_change_id: string }) => unknown, string]>([
    ['a request with no expected_revision', (ids) => ({ ...ids, unprotect: false }), 'expected_revision'],
    ['an expected_revision that is not a number', (ids) => ({ ...ids, expected_revision: '1', unprotect: false }), 'expected_revision'],
    ['a negative expected_revision', (ids) => ({ ...ids, expected_revision: -1, unprotect: false }), 'expected_revision'],
    ['a request with no unprotect', (ids) => ({ ...ids, expected_revision: 1 }), 'unprotect'],
    ['a deck change ID that is not a UUID', (ids) => ({ ...ids, deck_change_id: 'change-1', expected_revision: 1, unprotect: false }), 'deck_change_id'],
    ['an unknown field', (ids) => ({ ...ids, expected_revision: 1, unprotect: false, copy_id: ids.deck_id }), 'copy_id'],
  ])('%s is refused with invalid_argument', async (_, request, field) => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    await added(user, deckId, await scannedCopy(user));
    const ids = { deck_id: deckId, deck_change_id: await changeAt(user, deckId, 1) };

    const { error } = await revertDeckChanges(user.client, request(ids));

    expect(error).toMatchObject({ code: 'invalid_argument', field });
    expect((await deckOf(user, deckId)).revision).toBe(1);
  });
});

describe('access', () => {
  test("a user cannot preview or revert another user's deck changes", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const deckId = await created(alice);
    await added(alice, deckId, await scannedCopy(alice));
    const deckChangeId = await changeAt(alice, deckId, 1);

    const preview = await previewRevert(bob.client, { deck_id: deckId, deck_change_id: deckChangeId });
    const revert = await revertDeckChanges(bob.client, { deck_id: deckId, deck_change_id: deckChangeId, expected_revision: 1, unprotect: false });

    expect(preview).toMatchObject({ preview: null, error: { code: 'not_found', field: 'deck_id' } });
    expect(revert).toMatchObject({ reverted: null, error: { code: 'not_found', field: 'deck_id' } });
    expect((await deckOf(alice, deckId)).cards).toHaveLength(1);
  });

  test("a user's own deck with another user's deck change is not_found on deck_change_id", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const aliceDeck = await created(alice);
    await added(alice, aliceDeck, await scannedCopy(alice));
    const bobDeck = await created(bob);

    const { error } = await previewRevert(bob.client, { deck_id: bobDeck, deck_change_id: await changeAt(alice, aliceDeck, 1) });

    expect(error).toMatchObject({ code: 'not_found', field: 'deck_change_id' });
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot preview or revert deck changes', async (_, client) => {
    const ids = { deck_id: crypto.randomUUID(), deck_change_id: crypto.randomUUID() };

    const preview = await client().rpc('preview_revert', { query: ids });
    const revert = await client().rpc('revert_deck_changes', { request: { ...ids, expected_revision: 0, unprotect: false } });

    expect(preview.error?.code).toBe(permissionDenied);
    expect(revert.error?.code).toBe(permissionDenied);
  });
});

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { getCopy } from '../collection';
import { addDeckCard, createDeck, getDeck, listDecks, setDeckCommander, type Deck } from '../decks';
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

async function scannedCopy(user: TestUser, cardPrintingId = angelicCurator) {
  const scanned = stack(cardPrintingId);
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids[0]!;
}

async function deckCard(user: TestUser, deckId: string, cardPrintingId = angelicCurator) {
  const copyId = await scannedCopy(user, cardPrintingId);
  await replyOf(user.client, addDeckCard, { deck_id: deckId, copy_id: copyId, unprotect: false });
  return copyId;
}

async function setCommander(user: TestUser, copyId: string, commander: boolean) {
  return replyOf(user.client, setDeckCommander, { copy_id: copyId, commander });
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
  return data!;
}

function rolesOf(deck: Deck) {
  return Object.fromEntries(deck.cards.map((card) => [card.copy_id, card.role]));
}

describe('making a commander', () => {
  test('with no commander, writes one made_commander deck change with its line and raises the revision by one', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await deckCard(user, deckId);

    expect(await setCommander(user, copyId, true)).toEqual({ deck_id: deckId, revision: 2 });

    const deck = await deckOf(user, deckId);
    expect(deck.revision).toBe(2);
    expect(rolesOf(deck)).toEqual({ [copyId]: 'commander' });
    expect(deck.cards[0]!.commander_at).toEqual(expect.any(String));
    expect((await deckChangesOf(user, deckId)).at(-1)).toEqual({
      revision: 2,
      kind: 'made_commander',
      deck_change_lines: [
        { copy_id: copyId, card_printing_id: angelicCurator, finish: 'nonfoil', place_before: 'main', place_after: 'commander' },
      ],
    });
  });

  test('with one commander, writes one made_partner deck change', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const commander = await deckCard(user, deckId);
    const partner = await deckCard(user, deckId, delverInnistrad);
    await setCommander(user, commander, true);

    expect(await setCommander(user, partner, true)).toEqual({ deck_id: deckId, revision: 4 });

    expect(rolesOf(await deckOf(user, deckId))).toEqual({ [commander]: 'commander', [partner]: 'commander' });
    expect((await deckChangesOf(user, deckId)).at(-1)).toEqual({
      revision: 4,
      kind: 'made_partner',
      deck_change_lines: [
        { copy_id: partner, card_printing_id: delverInnistrad, finish: 'nonfoil', place_before: 'main', place_after: 'commander' },
      ],
    });
  });

  test('any card can be made a commander, even one that cannot lead a deck', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const delver = await deckCard(user, deckId, delverInnistrad);

    await setCommander(user, delver, true);

    expect((await deckOf(user, deckId)).commanders.map((commander) => commander.name)).toEqual([
      'Delver of Secrets // Insectile Aberration',
    ]);
  });

  test('a third commander is refused with commander_limit, and nothing changes', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const first = await deckCard(user, deckId);
    const second = await deckCard(user, deckId);
    const third = await deckCard(user, deckId, delverInnistrad);
    await setCommander(user, first, true);
    await setCommander(user, second, true);

    const result = await call(user.client, setDeckCommander, { copy_id: third, commander: true });

    expect(result).toMatchObject(refused('commander_limit', 'commander'));
    const deck = await deckOf(user, deckId);
    expect(deck.revision).toBe(5);
    expect(rolesOf(deck)[third]).toBe('main');
    expect(await deckChangesOf(user, deckId)).toHaveLength(5);
  });

  test('making a commander counts as using the deck', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    const copyId = await deckCard(user, atraxa);
    await created(user, 'Kinnan');

    await setCommander(user, copyId, true);

    expect((await decksOf(user)).map((deck) => deck.name)).toEqual(['Atraxa', 'Kinnan']);
  });

  test('a card that is already a commander stays one, with no deck change', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await deckCard(user, deckId);
    await setCommander(user, copyId, true);

    expect(await setCommander(user, copyId, true)).toEqual({ deck_id: deckId, revision: 2 });

    expect(await deckChangesOf(user, deckId)).toHaveLength(2);
  });
});

describe('moving a commander to the main deck', () => {
  test('writes one moved_to_main_deck deck change and keeps the card in the deck', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await deckCard(user, deckId);
    await setCommander(user, copyId, true);

    expect(await setCommander(user, copyId, false)).toEqual({ deck_id: deckId, revision: 3 });

    const deck = await deckOf(user, deckId);
    expect(rolesOf(deck)).toEqual({ [copyId]: 'main' });
    expect(deck.cards[0]!.commander_at).toBeNull();
    expect(deck.commanders).toEqual([]);
    expect(deck.card_count).toBe(1);
    expect((await deckChangesOf(user, deckId)).at(-1)).toEqual({
      revision: 3,
      kind: 'moved_to_main_deck',
      deck_change_lines: [
        { copy_id: copyId, card_printing_id: angelicCurator, finish: 'nonfoil', place_before: 'commander', place_after: 'main' },
      ],
    });
  });

  test('a main deck card stays in the main deck, with no deck change', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await deckCard(user, deckId);

    expect(await setCommander(user, copyId, false)).toEqual({ deck_id: deckId, revision: 1 });

    expect(await deckChangesOf(user, deckId)).toHaveLength(1);
  });

  test('frees a place for a second commander', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const [first, second, third] = [await deckCard(user, deckId), await deckCard(user, deckId), await deckCard(user, deckId)];
    await setCommander(user, first, true);
    await setCommander(user, second, true);

    await setCommander(user, first, false);
    await setCommander(user, third, true);

    expect((await deckOf(user, deckId)).commanders.map((commander) => commander.copy_id)).toEqual([second, third]);
    expect((await deckChangesOf(user, deckId)).at(-1)?.kind).toBe('made_partner');
  });
});

describe('commander order', () => {
  test('reads list commanders oldest first, and the oldest is the art of the deck tag', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const delver = await deckCard(user, deckId, delverInnistrad);
    const curator = await deckCard(user, deckId);
    await setCommander(user, delver, true);
    await setCommander(user, curator, true);

    const deck = await deckOf(user, deckId);
    expect(deck.commanders.map((commander) => commander.copy_id)).toEqual([delver, curator]);
    expect((await decksOf(user))[0]!.commanders.map((commander) => commander.copy_id)).toEqual([delver, curator]);
    expect(deck.commanders[0]!.art_crop_uri).toContain('https://cards.scryfall.io/art_crop/');
    expect((await copyOf(user, curator)).deck).toEqual({
      deck_id: deckId,
      name: 'Atraxa',
      role: 'commander',
      commander_art_crop_uri: deck.commanders[0]!.art_crop_uri,
      commander_count: 2,
    });
  });

  test('when the first commander moves to the main deck, the second commander becomes the first', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const delver = await deckCard(user, deckId, delverInnistrad);
    const curator = await deckCard(user, deckId);
    await setCommander(user, delver, true);
    await setCommander(user, curator, true);

    await setCommander(user, delver, false);

    expect((await deckOf(user, deckId)).commanders.map((commander) => commander.copy_id)).toEqual([curator]);
    expect((await copyOf(user, delver)).deck).toMatchObject({ role: 'main', commander_count: 1 });
  });
});

describe('refused requests', () => {
  test('a copy in no deck is refused with copy_not_in_deck', async () => {
    const user = await signUpNewUser();
    const copyId = await scannedCopy(user);

    const result = await call(user.client, setDeckCommander, { copy_id: copyId, commander: true });

    expect(result).toMatchObject(refused('copy_not_in_deck', 'copy_id'));
  });

  test('a copy that does not exist is not_found on copy_id', async () => {
    const user = await signUpNewUser();

    const result = await call(user.client, setDeckCommander, { copy_id: crypto.randomUUID(), commander: true });

    expect(result).toMatchObject(refused('not_found', 'copy_id'));
  });

  test.each<[string, (copyId: string) => unknown, string | null]>([
    ['a request that is not an object', () => [], null],
    ['a request with no copy ID', () => ({ commander: true }), 'copy_id'],
    ['a request with no commander flag', (copy_id) => ({ copy_id }), 'commander'],
    ['a copy ID that is not a UUID', () => ({ copy_id: 'copy-1', commander: true }), 'copy_id'],
    ['a commander flag that is not true or false', (copy_id) => ({ copy_id, commander: 'yes' }), 'commander'],
    ['an unknown field', (copy_id) => ({ copy_id, commander: true, deck_id: copy_id }), 'deck_id'],
  ])('%s is refused with invalid_argument, and nothing changes', async (_, request, field) => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await deckCard(user, deckId);

    const result = await call(user.client, setDeckCommander, request(copyId) as never);

    expect(result).toMatchObject(refused('invalid_argument', field));
    expect((await deckOf(user, deckId)).revision).toBe(1);
  });
});

describe('access', () => {
  test("a user cannot make another user's deck card a commander", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const deckId = await created(alice, 'Atraxa');
    const copyId = await deckCard(alice, deckId);

    const result = await call(bob.client, setDeckCommander, { copy_id: copyId, commander: true });

    expect(result).toMatchObject(refused('not_found', 'copy_id'));
    const deck = await deckOf(alice, deckId);
    expect(deck.revision).toBe(1);
    expect(rolesOf(deck)).toEqual({ [copyId]: 'main' });
  });

  test("a user cannot move another user's commander to the main deck", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const deckId = await created(alice, 'Atraxa');
    const copyId = await deckCard(alice, deckId);
    await setCommander(alice, copyId, true);

    const result = await call(bob.client, setDeckCommander, { copy_id: copyId, commander: false });

    expect(result).toMatchObject(refused('not_found', 'copy_id'));
    expect(rolesOf(await deckOf(alice, deckId))).toEqual({ [copyId]: 'commander' });
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot make a commander', async (_, client) => {
    const result = await call(client(), setDeckCommander, { copy_id: crypto.randomUUID(), commander: true });

    expect(result).toMatchObject(failed(permissionDenied));
  });
});

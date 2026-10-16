import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CopyDetails } from '../collection';
import type { Json } from '../database.types';
import { readDeckError, type AddedDeckCard, type CreatedDeck, type Deck, type DeckList } from '../decks';
import { readSearchError } from '../search';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { anonymousClient, asDatabaseOwner, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';

const basicLandNames = [
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
  'Wastes',
  'Snow-Covered Plains',
  'Snow-Covered Island',
  'Snow-Covered Swamp',
  'Snow-Covered Mountain',
  'Snow-Covered Forest',
  'Snow-Covered Wastes',
];

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

async function addDeckCard(client: AppClient, request: unknown) {
  const { data, error } = await client.rpc('add_deck_card', { request: request as Json });
  return { added: data as unknown as AddedDeckCard | null, error: error && readDeckError(error) };
}

async function added(user: TestUser, deckId: string, copyId: string, unprotect = false) {
  const { added: result, error } = await addDeckCard(user.client, { deck_id: deckId, copy_id: copyId, unprotect });
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

async function setProtected(user: TestUser, copyId: string, isProtected: boolean) {
  const { error } = await user.client.rpc('set_copy_protected', { request: { copy_id: copyId, protected: isProtected } });
  return error && readSearchError(error);
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

async function deckIdsHolding(copyId: string) {
  return asDatabaseOwner(async (database) => {
    const rows = await database`select deck_id from public.deck_cards where copy_id = ${copyId}`;
    return rows.map((row: { deck_id: string }) => row.deck_id);
  });
}

async function whileCopyIsLocked<T>(copyId: string, calls: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  await asDatabaseOwner((database) =>
    database.begin(async (transaction) => {
      await transaction`select id from public.copies where id = ${copyId} for update`;
      pending = calls();
      await Bun.sleep(500);
    }),
  );
  return pending!;
}

async function makeCommander(user: TestUser, copyId: string) {
  const { error } = await user.client.rpc('set_deck_commander', { request: { copy_id: copyId, commander: true } });
  expect(error).toBeNull();
}

describe('adding a copy to a deck', () => {
  test('puts the copy in the main deck, writes one added deck change with its line, and raises the revision by one', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user, angelicCurator, 'foil');

    expect(await added(user, deckId, copyId)).toEqual({ deck_id: deckId, revision: 1 });

    const deck = await deckOf(user, deckId);
    expect(deck.revision).toBe(1);
    expect(deck.cards.map((card) => [card.copy_id, card.role])).toEqual([[copyId, 'main']]);
    expect(await deckChangesOf(user, deckId)).toEqual([
      {
        revision: 1,
        kind: 'added',
        deck_change_lines: [
          { copy_id: copyId, card_printing_id: angelicCurator, finish: 'foil', place_before: null, place_after: 'main' },
        ],
      },
    ]);
  });

  test('each add is its own deck change', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const first = await scannedCopy(user);
    const second = await scannedCopy(user, delverInnistrad);

    await added(user, deckId, first);
    expect(await added(user, deckId, second)).toEqual({ deck_id: deckId, revision: 2 });

    expect((await deckChangesOf(user, deckId))!.map((change) => [change.revision, change.kind])).toEqual([
      [1, 'added'],
      [2, 'added'],
    ]);
  });

  test('adding a copy counts as using the deck', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');

    await added(user, atraxa, await scannedCopy(user));

    expect((await decksOf(user)).map((deck) => deck.name)).toEqual(['Atraxa', 'Kinnan']);
  });

  test('a copy in a deck is not free', async () => {
    const user = await signUpNewUser();
    const copyId = await scannedCopy(user);

    await added(user, await created(user, 'Atraxa'), copyId);

    expect((await copyOf(user, copyId)).free).toBe(false);
  });

  test('a copy in a deck is refused with copy_not_free, and nothing changes', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    const kinnan = await created(user, 'Kinnan');
    const copyId = await scannedCopy(user);
    await added(user, atraxa, copyId);

    for (const deckId of [atraxa, kinnan]) {
      const { added: result, error } = await addDeckCard(user.client, { deck_id: deckId, copy_id: copyId, unprotect: false });
      expect(result).toBeNull();
      expect(error).toMatchObject({ code: 'copy_not_free', field: 'copy_id' });
    }

    expect(await deckIdsHolding(copyId)).toEqual([atraxa]);
    expect((await deckOf(user, atraxa)).revision).toBe(1);
    expect((await deckOf(user, kinnan)).revision).toBe(0);
    expect(await deckChangesOf(user, kinnan)).toEqual([]);
  });

  test('a protected copy is refused with copy_protected, and stays protected and free', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user);
    expect(await setProtected(user, copyId, true)).toBeNull();

    const { error } = await addDeckCard(user.client, { deck_id: deckId, copy_id: copyId, unprotect: false });

    expect(error).toMatchObject({ code: 'copy_protected', field: 'copy_id' });
    expect(await copyOf(user, copyId)).toMatchObject({ protected: true, free: true, deck: null });
    expect((await deckOf(user, deckId)).revision).toBe(0);
    expect(await deckChangesOf(user, deckId)).toEqual([]);
  });

  test('unprotect unprotects a protected copy and adds it in one step', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user);
    await setProtected(user, copyId, true);

    await added(user, deckId, copyId, true);

    expect(await copyOf(user, copyId)).toMatchObject({ protected: false, free: false, deck: { deck_id: deckId } });
  });

  test('unprotect on a copy that is not protected adds it', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user);

    await added(user, deckId, copyId, true);

    expect(await copyOf(user, copyId)).toMatchObject({ protected: false, deck: { deck_id: deckId } });
  });

  test('Protect refuses a copy in a deck with copy_not_free', async () => {
    const user = await signUpNewUser();
    const copyId = await scannedCopy(user);
    await added(user, await created(user, 'Atraxa'), copyId);

    expect(await setProtected(user, copyId, true)).toMatchObject({ code: 'copy_not_free', field: 'copy_id' });
    expect((await copyOf(user, copyId)).protected).toBe(false);
  });

  test('two adds of one copy into two decks at the same time put it in exactly one deck', async () => {
    const user = await signUpNewUser();
    const decks = [await created(user, 'Atraxa'), await created(user, 'Kinnan')];
    const copyId = await scannedCopy(user);

    const results = await whileCopyIsLocked(copyId, () =>
      Promise.all(decks.map((deckId) => addDeckCard(user.client, { deck_id: deckId, copy_id: copyId, unprotect: false }))),
    );

    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    expect(results.filter((result) => result.error?.code === 'copy_not_free')).toHaveLength(1);
    const holding = await deckIdsHolding(copyId);
    expect(holding).toHaveLength(1);
    const winner = decks.indexOf(holding[0]!);
    expect((await deckOf(user, decks[winner]!)).revision).toBe(1);
    expect((await deckOf(user, decks[1 - winner]!)).revision).toBe(0);
  });

  test('a deck that does not exist is not_found on deck_id', async () => {
    const user = await signUpNewUser();
    const copyId = await scannedCopy(user);

    const { error } = await addDeckCard(user.client, { deck_id: crypto.randomUUID(), copy_id: copyId, unprotect: false });

    expect(error).toMatchObject({ code: 'not_found', field: 'deck_id' });
  });

  test('a copy that does not exist is not_found on copy_id', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');

    const { error } = await addDeckCard(user.client, { deck_id: deckId, copy_id: crypto.randomUUID(), unprotect: false });

    expect(error).toMatchObject({ code: 'not_found', field: 'copy_id' });
    expect((await deckOf(user, deckId)).revision).toBe(0);
  });

  test.each<[string, (ids: { deck_id: string; copy_id: string }) => unknown, string | null]>([
    ['a request that is not an object', () => [], null],
    ['a request with no deck ID', ({ copy_id }) => ({ copy_id, unprotect: false }), 'deck_id'],
    ['a request with no copy ID', ({ deck_id }) => ({ deck_id, unprotect: false }), 'copy_id'],
    ['a request with no unprotect flag', (ids) => ids, 'unprotect'],
    ['a deck ID that is not a UUID', ({ copy_id }) => ({ deck_id: 'deck-1', copy_id, unprotect: false }), 'deck_id'],
    ['a copy ID that is not a UUID', ({ deck_id }) => ({ deck_id, copy_id: 7, unprotect: false }), 'copy_id'],
    ['an unprotect flag that is not true or false', (ids) => ({ ...ids, unprotect: 'yes' }), 'unprotect'],
    ['an unknown field', (ids) => ({ ...ids, unprotect: false, role: 'commander' }), 'role'],
  ])('%s is refused with invalid_argument, and nothing changes', async (_, request, field) => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user);

    const { error } = await addDeckCard(user.client, request({ deck_id: deckId, copy_id: copyId }));

    expect(error).toMatchObject({ code: 'invalid_argument', field });
    expect(await deckIdsHolding(copyId)).toEqual([]);
    expect((await deckOf(user, deckId)).revision).toBe(0);
  });
});

describe('reading a deck with cards', () => {
  test('get_deck returns every copy with its role, its card printing, its state, its price, and its card', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user, delverInnistrad);
    await added(user, deckId, copyId);

    const deck = await deckOf(user, deckId);

    expect(deck.card_count).toBe(1);
    expect(deck.cards).toEqual([
      {
        copy_id: copyId,
        printing_id: delverInnistrad,
        name: 'Delver of Secrets // Insectile Aberration',
        set: 'isd',
        collector_number: '51',
        rarity: 'common',
        image_uris: [expect.stringContaining('https://cards.scryfall.io/normal/'), expect.stringContaining('https://cards.scryfall.io/normal/')],
        finish: 'nonfoil',
        condition: 'near_mint',
        language: 'en',
        protected: false,
        price: expect.objectContaining({ stale: expect.any(Boolean) }),
        role: 'main',
        commander_at: null,
        added_at: expect.any(String),
        type_line: 'Creature — Human Wizard // Creature — Human Insect',
        mana_value: 1,
        colors: ['U'],
      },
    ]);
  });

  test('get_deck lists all twelve basic land kinds with count 0', async () => {
    const user = await signUpNewUser();

    const deck = await deckOf(user, await created(user, 'Atraxa'));

    expect(deck.basic_lands.map((land) => [land.name, land.count])).toEqual(basicLandNames.map((name) => [name, 0]));
  });

  test('a commander has the commander role, and its art crop is the first commander of the deck', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const commander = await scannedCopy(user);
    const mainDeckCard = await scannedCopy(user, delverInnistrad);
    await added(user, deckId, commander);
    await added(user, deckId, mainDeckCard);
    await makeCommander(user, commander);

    const deck = await deckOf(user, deckId);

    expect(deck.commanders).toEqual([
      { copy_id: commander, name: 'Angelic Curator', art_crop_uri: expect.stringContaining('https://cards.scryfall.io/art_crop/') },
    ]);
    expect(Object.fromEntries(deck.cards.map((card) => [card.copy_id, card.role]))).toEqual({
      [commander]: 'commander',
      [mainDeckCard]: 'main',
    });
    expect((await copyOf(user, mainDeckCard)).deck).toEqual({
      deck_id: deckId,
      name: 'Atraxa',
      role: 'main',
      commander_art_crop_uri: deck.commanders[0]!.art_crop_uri,
      commander_count: 1,
    });
    expect((await copyOf(user, commander)).deck?.role).toBe('commander');
  });

  test('list_decks shows the deck revision of each deck', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');
    await added(user, atraxa, await scannedCopy(user));
    await added(user, atraxa, await scannedCopy(user, delverInnistrad));

    expect((await decksOf(user)).map((deck) => [deck.name, deck.revision])).toEqual([
      ['Atraxa', 2],
      ['Kinnan', 0],
    ]);
  });

  test('list_decks counts the cards of each deck', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');
    await added(user, atraxa, await scannedCopy(user));
    await added(user, atraxa, await scannedCopy(user, delverInnistrad));

    expect((await decksOf(user)).map((deck) => [deck.name, deck.card_count])).toEqual([
      ['Atraxa', 2],
      ['Kinnan', 0],
    ]);
  });

  test('get_copy returns the deck of a copy in a deck, and null for a free copy', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const inDeck = await scannedCopy(user);
    const free = await scannedCopy(user);
    await added(user, deckId, inDeck);

    expect((await copyOf(user, inDeck)).deck).toEqual({ deck_id: deckId, name: 'Atraxa', role: 'main', commander_art_crop_uri: null, commander_count: 0 });
    expect((await copyOf(user, free)).deck).toBeNull();
  });
});

describe('deleting a deck', () => {
  test('deletes its deck cards and deck changes and frees its copies', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user);
    await added(user, deckId, copyId);

    const { error } = await user.client.rpc('delete_deck', { request: { deck_id: deckId } });

    expect(error).toBeNull();
    expect(await deckIdsHolding(copyId)).toEqual([]);
    const changes = await asDatabaseOwner((database) => database`select id from public.deck_changes where deck_id = ${deckId}`);
    expect([...changes]).toEqual([]);
    expect(await copyOf(user, copyId)).toMatchObject({ free: true, deck: null });
    expect(await setProtected(user, copyId, true)).toBeNull();
  });
});

describe('access', () => {
  test("a user cannot add another user's copy, add to another user's deck, or read another user's deck cards", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const aliceDeck = await created(alice, 'Atraxa');
    const aliceCopy = await scannedCopy(alice);
    await added(alice, aliceDeck, aliceCopy);
    const bobDeck = await created(bob, 'Kinnan');
    const bobCopy = await scannedCopy(bob);
    const freeAliceCopy = await scannedCopy(alice);

    expect((await addDeckCard(bob.client, { deck_id: bobDeck, copy_id: freeAliceCopy, unprotect: false })).error).toMatchObject({
      code: 'not_found',
      field: 'copy_id',
    });
    expect((await addDeckCard(bob.client, { deck_id: aliceDeck, copy_id: bobCopy, unprotect: false })).error).toMatchObject({
      code: 'not_found',
      field: 'deck_id',
    });
    expect(await deckIdsHolding(freeAliceCopy)).toEqual([]);
    expect(await deckIdsHolding(bobCopy)).toEqual([]);
    expect((await deckOf(alice, aliceDeck)).revision).toBe(1);
    expect((await deckOf(bob, bobDeck)).revision).toBe(0);
    for (const table of ['deck_cards', 'deck_changes', 'deck_change_lines'] as const) {
      const { data, error } = await bob.client.from(table).select('user_id').eq('user_id', alice.userId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot add a copy to a deck', async (_, client) => {
    const { error } = await client().rpc('add_deck_card', {
      request: { deck_id: crypto.randomUUID(), copy_id: crypto.randomUUID(), unprotect: false },
    });

    expect(error?.code).toBe(permissionDenied);
  });

  test('a user cannot write deck cards, deck changes, or deck change lines directly', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const copyId = await scannedCopy(user);
    await added(user, deckId, copyId);
    const [change] = (await asDatabaseOwner((database) => database`select id from public.deck_changes where deck_id = ${deckId}`)) as {
      id: string;
    }[];

    const writes = [
      user.client.from('deck_cards').insert({ user_id: user.userId, deck_id: deckId, copy_id: copyId }),
      user.client.from('deck_cards').update({ commander_at: new Date().toISOString() }).eq('copy_id', copyId),
      user.client.from('deck_cards').delete().eq('copy_id', copyId),
      user.client.from('deck_changes').insert({ user_id: user.userId, deck_id: deckId, revision: 2, kind: 'added' }),
      user.client.from('deck_changes').delete().eq('deck_id', deckId),
      user.client.from('deck_change_lines').update({ place_after: 'commander' }).eq('deck_change_id', change!.id),
      user.client.from('deck_change_lines').delete().eq('deck_change_id', change!.id),
    ];
    for (const { error } of await Promise.all(writes)) {
      expect(error?.code).toBe(permissionDenied);
    }

    expect(await deckIdsHolding(copyId)).toEqual([deckId]);
    expect(await deckChangesOf(user, deckId)).toHaveLength(1);
  });
});

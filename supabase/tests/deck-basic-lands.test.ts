import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { changeBasicLand, deleteDeck, listBasicLandCards, listDeckChanges, listDecks, type Deck } from '../decks';
import {
  basicLand,
  basicLands,
  catalogFixture,
  oracleIdOf,
  resetCardCatalog,
  runCatalogImport,
  type ScryfallRecord,
} from './catalog-import-command';
import { call, failed, refused, replyOf } from './database-calls';
import { createdDeck, deckOf } from './deck-calls';
import {
  anonymousClient,
  asDatabaseOwner,
  asSignedInUser,
  secretKeyClient,
  signUpNewUser,
  type AppClient,
  type TestUser,
} from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const basicLandKinds = 12;
const [forest, wastes, snowCoveredForest] = ['Forest', 'Wastes', 'Snow-Covered Forest'].map(
  (name) => basicLand(name).oracle_id,
) as [string, string, string];

const forestPrinting = basicLand('Forest');

function withNewerForestsThatAreNotRegular(records: ScryfallRecord[]): ScryfallRecord[] {
  const forestRecord = records.find((record) => record.id === forestPrinting.id)!;
  const newerForest = (changes: ScryfallRecord): ScryfallRecord => ({
    ...forestRecord,
    id: crypto.randomUUID(),
    released_at: '2030-01-01',
    ...changes,
  });
  return [
    ...records,
    newerForest({ collector_number: '279', image_uris: undefined }),
    newerForest({ lang: 'ja', image_uris: { normal: 'https://cards.scryfall.io/normal/front/forest-ja.jpg' } }),
    newerForest({ collector_number: '280', finishes: ['foil'], image_uris: { normal: 'https://cards.scryfall.io/normal/front/forest-foil.jpg' } }),
  ];
}

beforeAll(async () => {
  await resetCardCatalog();
  const manifest = await catalogFixture({
    defaultCards: withNewerForestsThatAreNotRegular,
  });
  expect((await runCatalogImport(manifest)).exitCode).toBe(0);
});

async function basicLandChanged(user: TestUser, deckId: string, oracleId: string, by: number) {
  return replyOf(user.client, changeBasicLand, { deck_id: deckId, oracle_id: oracleId, by });
}

async function deckChangesPageOf(user: TestUser, deckId: string) {
  return replyOf(user.client, listDeckChanges, { deck_id: deckId });
}

async function decksOf(user: TestUser) {
  return (await replyOf(user.client, listDecks)).items;
}

function countsOf(deck: Deck) {
  return Object.fromEntries(deck.basic_lands.filter((land) => land.count > 0).map((land) => [land.name, land.count]));
}

function byOracleId<T extends { oracle_id: string }>(lines: T[]) {
  return lines.toSorted((a, b) => a.oracle_id.localeCompare(b.oracle_id));
}

async function deckChangesOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client
    .from('deck_changes')
    .select('revision, kind, deck_change_basic_lands(oracle_id, count_before, count_after)')
    .eq('deck_id', deckId)
    .order('revision');
  expect(error).toBeNull();
  return data!.map((change) => ({ ...change, deck_change_basic_lands: byOracleId(change.deck_change_basic_lands) }));
}

describe('changing a basic land card', () => {
  test('adding basic lands writes one basic_lands deck change with one line and raises the revision by one', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');

    expect(await basicLandChanged(user, deckId, forest, 8)).toEqual({ deck_id: deckId, revision: 1 });

    const deck = await deckOf(user, deckId);
    expect(deck.revision).toBe(1);
    expect(countsOf(deck)).toEqual({ Forest: 8 });
    expect(deck.card_count).toBe(8);
    expect(await deckChangesOf(user, deckId)).toEqual([
      { revision: 1, kind: 'basic_lands', deck_change_basic_lands: [{ oracle_id: forest, count_before: 0, count_after: 8 }] },
    ]);
  });

  test('adding more of a basic land card in the deck adds to its count', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');
    await basicLandChanged(user, deckId, forest, 8);

    expect(await basicLandChanged(user, deckId, forest, 2)).toEqual({ deck_id: deckId, revision: 2 });

    expect(countsOf(await deckOf(user, deckId))).toEqual({ Forest: 10 });
    expect((await deckChangesOf(user, deckId))[1]!.deck_change_basic_lands).toEqual([
      { oracle_id: forest, count_before: 8, count_after: 10 },
    ]);
  });

  test('removing one takes one off its count, and removing the last one takes the basic land card out of the deck', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');
    await basicLandChanged(user, deckId, forest, 2);
    await basicLandChanged(user, deckId, snowCoveredForest, 1);

    await basicLandChanged(user, deckId, forest, -1);
    expect(countsOf(await deckOf(user, deckId))).toEqual({ Forest: 1, 'Snow-Covered Forest': 1 });

    expect(await basicLandChanged(user, deckId, snowCoveredForest, -1)).toEqual({ deck_id: deckId, revision: 4 });
    const deck = await deckOf(user, deckId);
    expect(countsOf(deck)).toEqual({ Forest: 1 });
    expect(deck.card_count).toBe(1);
    expect((await deckChangesOf(user, deckId)).slice(2)).toEqual([
      { revision: 3, kind: 'basic_lands', deck_change_basic_lands: [{ oracle_id: forest, count_before: 2, count_after: 1 }] },
      {
        revision: 4,
        kind: 'basic_lands',
        deck_change_basic_lands: [{ oracle_id: snowCoveredForest, count_before: 1, count_after: 0 }],
      },
    ]);
  });

  test('get_deck returns each basic land card with its image and its count', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');
    await basicLandChanged(user, deckId, wastes, 3);

    const deck = await deckOf(user, deckId);

    expect(deck.basic_lands.find((land) => land.name === 'Wastes')).toEqual({
      oracle_id: wastes,
      name: 'Wastes',
      image_uris: [basicLand('Wastes').image_uris.normal],
      count: 3,
    });
    expect(deck.basic_lands.find((land) => land.name === 'Forest')).toMatchObject({ oracle_id: forest, count: 0 });
  });

  test('each basic land card shows the image of a printing of that basic land, in get_deck and in its deck change lines', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');
    for (const land of basicLands) {
      await basicLandChanged(user, deckId, land.oracle_id, 2);
    }

    const deck = await deckOf(user, deckId);
    const lines = (await deckChangesPageOf(user, deckId)).items.flatMap((change) => change.lines);

    for (const land of basicLands) {
      const image = deck.basic_lands.find((deckLand) => deckLand.oracle_id === land.oracle_id)!.image_uris;
      const { data: printings } = await user.client.from('card_printings').select('oracle_id').contains('image_uris', image);
      expect(image).toHaveLength(1);
      expect(printings!.map((printing) => printing.oracle_id)).toEqual([land.oracle_id]);
      expect(lines).toContainEqual(expect.objectContaining({ oracle_id: land.oracle_id, image_uris: image }));
    }
  });

  test('the image of a basic land card is its newest English printing with an image and a nonfoil finish', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');

    const deck = await deckOf(user, deckId);

    expect(deck.basic_lands.find((land) => land.name === 'Forest')!.image_uris).toEqual([forestPrinting.image_uris.normal]);
  });

  test('get_deck and list_deck_changes read only the basic land cards from the card catalog', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');
    await basicLandChanged(user, deckId, forest, 8);
    const query = JSON.stringify({ deck_id: deckId });
    await asDatabaseOwner((database) => database`analyze public.cards, public.card_printings`);

    const [{ card_rows_read }] = await asSignedInUser(user, async (database) => {
      await database`set local enable_seqscan = off`;
      await database`select public.get_deck(${query}::text::jsonb)`;
      await database`select public.list_deck_changes(${query}::text::jsonb)`;
      return database`
        select coalesce(sum(seq_tup_read + idx_tup_fetch), 0)::integer as card_rows_read
        from pg_stat_xact_user_tables
        where schemaname = 'public' and relname = 'cards'
      `;
    });

    expect(card_rows_read).toBeLessThanOrEqual(basicLandKinds * 3);
  });

  test('changing a basic land card counts as using the deck, and list_decks counts the basic lands', async () => {
    const user = await signUpNewUser();
    const atraxa = await createdDeck(user, 'Atraxa');
    await createdDeck(user, 'Kinnan');

    await basicLandChanged(user, atraxa, forest, 30);

    expect((await decksOf(user)).map((deck) => [deck.name, deck.card_count])).toEqual([
      ['Atraxa', 30],
      ['Kinnan', 0],
    ]);
  });

  test('deleting a deck deletes its basic lands', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');
    await basicLandChanged(user, deckId, forest, 8);

    expect(await call(user.client, deleteDeck, { deck_id: deckId })).toEqual({ status: 'replied', reply: null });
    const rows = await asDatabaseOwner(
      (database) => database`
        select deck_id from public.deck_basic_lands where deck_id = ${deckId}
        union all
        select change.deck_id from public.deck_change_basic_lands line
        join public.deck_changes change on change.id = line.deck_change_id
        where change.deck_id = ${deckId}
      `,
    );
    expect([...rows]).toEqual([]);
  });
});

describe('list_basic_land_cards', () => {
  test('lists the twelve basic land cards in order, each with the image that get_deck shows', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');

    const { items } = await replyOf(user.client, listBasicLandCards);

    const deck = await deckOf(user, deckId);
    expect(items).toEqual(
      deck.basic_lands.map(({ oracle_id, name, image_uris }) => ({ oracle_id: oracle_id!, name, image_uris })),
    );
    expect(items.map((land) => land.name)).toEqual([
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
    ]);
  });
});

describe('refused basic land changes', () => {
  test('a card that is not one of the twelve basic land cards is refused with invalid_argument on oracle_id', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');
    const rockfaceVillage = await oracleIdOf('Rockface Village');

    for (const oracleId of [rockfaceVillage, crypto.randomUUID()]) {
      expect(await call(user.client, changeBasicLand, { deck_id: deckId, oracle_id: oracleId, by: 1 })).toMatchObject(
        refused('invalid_argument', 'oracle_id'),
      );
    }

    expect((await deckOf(user, deckId)).revision).toBe(0);
  });

  test.each<[string, number, number]>([
    ['a count below 0', 0, -1],
    ['a count above 99', 98, 2],
  ])('a change to %s is refused with invalid_argument on by, and nothing changes', async (_, start, by) => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');
    if (start > 0) {
      await basicLandChanged(user, deckId, forest, start);
    }

    expect(await call(user.client, changeBasicLand, { deck_id: deckId, oracle_id: forest, by })).toMatchObject(
      refused('invalid_argument', 'by'),
    );
    expect(countsOf(await deckOf(user, deckId))).toEqual(start > 0 ? { Forest: start } : {});
    expect((await deckOf(user, deckId)).revision).toBe(start > 0 ? 1 : 0);
  });

  test('counts of 99 and 0 are accepted', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');

    await basicLandChanged(user, deckId, forest, 99);
    expect(countsOf(await deckOf(user, deckId))).toEqual({ Forest: 99 });

    await basicLandChanged(user, deckId, forest, -99);
    expect(countsOf(await deckOf(user, deckId))).toEqual({});
  });

  test.each<[string, (deckId: string) => unknown, string | null]>([
    ['a request that is not an object', () => [], null],
    ['a request with no deck ID', () => ({ oracle_id: forest, by: 1 }), 'deck_id'],
    ['a request with no card', (deck_id) => ({ deck_id, by: 1 }), 'oracle_id'],
    ['a request with no change', (deck_id) => ({ deck_id, oracle_id: forest }), 'by'],
    ['a card that is not a UUID', (deck_id) => ({ deck_id, oracle_id: 'forest', by: 1 }), 'oracle_id'],
    ['a change of 0', (deck_id) => ({ deck_id, oracle_id: forest, by: 0 }), 'by'],
    ['a change above 99', (deck_id) => ({ deck_id, oracle_id: forest, by: 100 }), 'by'],
    ['a change below -99', (deck_id) => ({ deck_id, oracle_id: forest, by: -100 }), 'by'],
    ['a change that is not whole', (deck_id) => ({ deck_id, oracle_id: forest, by: 1.5 }), 'by'],
    ['a change that is not a number', (deck_id) => ({ deck_id, oracle_id: forest, by: '8' }), 'by'],
    ['an unknown field', (deck_id) => ({ deck_id, oracle_id: forest, by: 1, count: 1 }), 'count'],
  ])('%s is refused with invalid_argument, and nothing changes', async (_, request, field) => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');

    expect(await call(user.client, changeBasicLand, request(deckId) as never)).toMatchObject(refused('invalid_argument', field));
    expect((await deckOf(user, deckId)).revision).toBe(0);
  });

  test('a deck that does not exist is not_found on deck_id', async () => {
    const user = await signUpNewUser();

    const result = await call(user.client, changeBasicLand, { deck_id: crypto.randomUUID(), oracle_id: forest, by: 8 });

    expect(result).toMatchObject(refused('not_found', 'deck_id'));
  });
});

describe('access', () => {
  test("a user cannot change or read another user's basic lands", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const aliceDeck = await createdDeck(alice, 'Atraxa');
    await basicLandChanged(alice, aliceDeck, forest, 8);

    const result = await call(bob.client, changeBasicLand, { deck_id: aliceDeck, oracle_id: forest, by: 1 });

    expect(result).toMatchObject(refused('not_found', 'deck_id'));
    expect(countsOf(await deckOf(alice, aliceDeck))).toEqual({ Forest: 8 });
    expect((await deckOf(alice, aliceDeck)).revision).toBe(1);
    for (const table of ['deck_basic_lands', 'deck_change_basic_lands'] as const) {
      const { data, error } = await bob.client.from(table).select('user_id').eq('user_id', alice.userId);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot change basic lands or list the basic land cards', async (_, client) => {
    expect(await call(client(), listBasicLandCards)).toMatchObject(failed(permissionDenied));

    const result = await call(client(), changeBasicLand, { deck_id: crypto.randomUUID(), oracle_id: forest, by: 1 });

    expect(result).toMatchObject(failed(permissionDenied));
  });

  test('a user cannot write basic lands or their deck change lines directly', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Atraxa');
    await basicLandChanged(user, deckId, forest, 8);

    const writes = [
      user.client.from('deck_basic_lands').insert({ user_id: user.userId, deck_id: deckId, oracle_id: wastes, count: 1 }),
      user.client.from('deck_basic_lands').update({ count: 9 }).eq('deck_id', deckId),
      user.client.from('deck_basic_lands').delete().eq('deck_id', deckId),
      user.client.from('deck_change_basic_lands').update({ count_after: 9 }).eq('oracle_id', forest),
      user.client.from('deck_change_basic_lands').delete().eq('oracle_id', forest),
    ];
    for (const { error } of await Promise.all(writes)) {
      expect(error?.code).toBe(permissionDenied);
    }

    expect(countsOf(await deckOf(user, deckId))).toEqual({ Forest: 8 });
    expect((await deckChangesOf(user, deckId))[0]!.deck_change_basic_lands).toHaveLength(1);
  });
});

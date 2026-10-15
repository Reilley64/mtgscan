import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import {
  readDeckError,
  type CreatedDeck,
  type Deck,
  type DeckChangePage,
  type DeckList,
  type SetBasicLandsResult,
} from '../decks';
import {
  basicLands,
  catalogFixture,
  oracleIdOf,
  resetCardCatalog,
  runCatalogImport,
  withBasicLands,
  type ScryfallRecord,
} from './catalog-import-command';
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
const [forest, wastes, snowCoveredForest] = basicLands.map((land) => land.oracle_id) as [string, string, string];

const forestPrinting = basicLands[0]!;

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
    oracleCards: withBasicLands,
    defaultCards: (records) => withNewerForestsThatAreNotRegular(withBasicLands(records)),
  });
  expect((await runCatalogImport(manifest)).exitCode).toBe(0);
});

async function created(user: TestUser, name: string) {
  const { data, error } = await user.client.rpc('create_deck', { request: { name } });
  expect(error).toBeNull();
  return (data as unknown as CreatedDeck).deck_id;
}

async function setBasicLands(client: AppClient, request: unknown) {
  const { data, error } = await client.rpc('set_basic_lands', { request: request as Json });
  return { result: data as unknown as SetBasicLandsResult | null, error: error && readDeckError(error) };
}

async function basicLandsSet(user: TestUser, deckId: string, counts: { oracle_id: string; count: number }[]) {
  const { result, error } = await setBasicLands(user.client, { deck_id: deckId, counts });
  expect(error).toBeNull();
  return result!;
}

async function deckOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return data as unknown as Deck;
}

async function deckChangesPageOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('list_deck_changes', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return data as unknown as DeckChangePage;
}

async function decksOf(user: TestUser) {
  const { data, error } = await user.client.rpc('list_decks');
  expect(error).toBeNull();
  return (data as unknown as DeckList).items;
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

describe('setting basic lands', () => {
  test('sets the counts, writes one basic_lands deck change with a line per changed basic land card, and raises the revision by one', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');

    expect(
      await basicLandsSet(user, deckId, [
        { oracle_id: forest, count: 8 },
        { oracle_id: snowCoveredForest, count: 2 },
      ]),
    ).toEqual({ deck_id: deckId, revision: 1 });

    const deck = await deckOf(user, deckId);
    expect(deck.revision).toBe(1);
    expect(countsOf(deck)).toEqual({ Forest: 8, 'Snow-Covered Forest': 2 });
    expect(deck.card_count).toBe(10);
    expect(await deckChangesOf(user, deckId)).toEqual([
      {
        revision: 1,
        kind: 'basic_lands',
        deck_change_basic_lands: byOracleId([
          { oracle_id: forest, count_before: 0, count_after: 8 },
          { oracle_id: snowCoveredForest, count_before: 0, count_after: 2 },
        ]),
      },
    ]);
  });

  test('get_deck returns each basic land card with its image and its count', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    await basicLandsSet(user, deckId, [{ oracle_id: wastes, count: 3 }]);

    const deck = await deckOf(user, deckId);

    expect(deck.basic_lands.find((land) => land.name === 'Wastes')).toEqual({
      oracle_id: wastes,
      name: 'Wastes',
      image_uris: [basicLands[1]!.image_uris.normal],
      count: 3,
    });
    expect(deck.basic_lands.find((land) => land.name === 'Forest')).toMatchObject({ oracle_id: forest, count: 0 });
  });

  test('each basic land card shows the image of a printing of that basic land, in get_deck and in its deck change lines', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    await basicLandsSet(user, deckId, basicLands.map((land) => ({ oracle_id: land.oracle_id, count: 2 })));

    const deck = await deckOf(user, deckId);
    const [change] = (await deckChangesPageOf(user, deckId)).items;

    for (const land of basicLands) {
      const image = deck.basic_lands.find((deckLand) => deckLand.oracle_id === land.oracle_id)!.image_uris;
      const { data: printings } = await user.client.from('card_printings').select('oracle_id').contains('image_uris', image);
      expect(image).toHaveLength(1);
      expect(printings!.map((printing) => printing.oracle_id)).toEqual([land.oracle_id]);
      expect(change!.lines).toContainEqual(expect.objectContaining({ oracle_id: land.oracle_id, image_uris: image }));
    }
  });

  test('the image of a basic land card is its newest English printing with an image and a nonfoil finish', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');

    const deck = await deckOf(user, deckId);

    expect(deck.basic_lands.find((land) => land.name === 'Forest')!.image_uris).toEqual([forestPrinting.image_uris.normal]);
  });

  test('get_deck and list_deck_changes read only the basic land cards from the card catalog', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    await basicLandsSet(user, deckId, [{ oracle_id: forest, count: 8 }]);
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

    expect(card_rows_read).toBeLessThanOrEqual(basicLandKinds * 2);
  });

  test('a later request lines up only the basic land cards it changes, and a count of 0 takes the card out', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    await basicLandsSet(user, deckId, [
      { oracle_id: forest, count: 8 },
      { oracle_id: snowCoveredForest, count: 2 },
    ]);

    expect(
      await basicLandsSet(user, deckId, [
        { oracle_id: forest, count: 0 },
        { oracle_id: snowCoveredForest, count: 2 },
        { oracle_id: wastes, count: 1 },
      ]),
    ).toEqual({ deck_id: deckId, revision: 2 });

    const deck = await deckOf(user, deckId);
    expect(countsOf(deck)).toEqual({ Wastes: 1, 'Snow-Covered Forest': 2 });
    expect(deck.card_count).toBe(3);
    expect((await deckChangesOf(user, deckId))[1]).toEqual({
      revision: 2,
      kind: 'basic_lands',
      deck_change_basic_lands: byOracleId([
        { oracle_id: forest, count_before: 8, count_after: 0 },
        { oracle_id: wastes, count_before: 0, count_after: 1 },
      ]),
    });
  });

  test.each<[string, (counts: { oracle_id: string; count: number }[]) => { oracle_id: string; count: number }[]]>([
    ['the same counts', (counts) => counts],
    ['no counts', () => []],
    ['a count of 0 for a basic land card that is not in the deck', () => [{ oracle_id: wastes, count: 0 }]],
  ])('a request with %s makes no deck change', async (_, request) => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const counts = [{ oracle_id: forest, count: 8 }];
    await basicLandsSet(user, deckId, counts);

    expect(await basicLandsSet(user, deckId, request(counts))).toEqual({ deck_id: deckId, revision: 1 });

    expect((await deckOf(user, deckId)).revision).toBe(1);
    expect(countsOf(await deckOf(user, deckId))).toEqual({ Forest: 8 });
    expect(await deckChangesOf(user, deckId)).toHaveLength(1);
  });

  test('setting basic lands counts as using the deck, and list_decks counts them', async () => {
    const user = await signUpNewUser();
    const atraxa = await created(user, 'Atraxa');
    await created(user, 'Kinnan');

    await basicLandsSet(user, atraxa, [{ oracle_id: forest, count: 30 }]);

    expect((await decksOf(user)).map((deck) => [deck.name, deck.card_count])).toEqual([
      ['Atraxa', 30],
      ['Kinnan', 0],
    ]);
  });

  test('deleting a deck deletes its basic lands', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    await basicLandsSet(user, deckId, [{ oracle_id: forest, count: 8 }]);

    const { error } = await user.client.rpc('delete_deck', { request: { deck_id: deckId } });

    expect(error).toBeNull();
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

describe('refused basic land requests', () => {
  test('a card that is not one of the twelve basic land cards is refused with invalid_argument on its item', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    const rockfaceVillage = await oracleIdOf('Rockface Village');

    for (const oracleId of [rockfaceVillage, crypto.randomUUID()]) {
      const { error } = await setBasicLands(user.client, {
        deck_id: deckId,
        counts: [
          { oracle_id: forest, count: 8 },
          { oracle_id: oracleId, count: 1 },
        ],
      });
      expect(error).toMatchObject({ code: 'invalid_argument', field: 'counts[1].oracle_id' });
    }

    expect((await deckOf(user, deckId)).revision).toBe(0);
    expect(countsOf(await deckOf(user, deckId))).toEqual({});
  });

  test.each<[string, unknown]>([
    ['a count below 0', -1],
    ['a count above 99', 100],
    ['a count that is not whole', 1.5],
    ['a count that is not a number', '8'],
  ])('%s is refused with invalid_argument on the count', async (_, count) => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');

    const { error } = await setBasicLands(user.client, { deck_id: deckId, counts: [{ oracle_id: forest, count }] });

    expect(error).toMatchObject({ code: 'invalid_argument', field: 'counts[0].count' });
    expect((await deckOf(user, deckId)).revision).toBe(0);
  });

  test('counts of 0 and 99 are accepted', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');

    await basicLandsSet(user, deckId, [
      { oracle_id: forest, count: 99 },
      { oracle_id: wastes, count: 0 },
    ]);

    expect(countsOf(await deckOf(user, deckId))).toEqual({ Forest: 99 });
  });

  test.each<[string, (deckId: string) => unknown, string | null]>([
    ['a request that is not an object', () => [], null],
    ['a request with no deck ID', () => ({ counts: [] }), 'deck_id'],
    ['a request with no counts', (deck_id) => ({ deck_id }), 'counts'],
    ['a counts field that is not a list', (deck_id) => ({ deck_id, counts: { oracle_id: forest, count: 1 } }), 'counts'],
    ['a count that is not an object', (deck_id) => ({ deck_id, counts: [8] }), 'counts[0]'],
    ['a count with no card', (deck_id) => ({ deck_id, counts: [{ count: 8 }] }), 'counts[0].oracle_id'],
    ['a count with no number', (deck_id) => ({ deck_id, counts: [{ oracle_id: forest }] }), 'counts[0].count'],
    ['a card that is not a UUID', (deck_id) => ({ deck_id, counts: [{ oracle_id: 'forest', count: 8 }] }), 'counts[0].oracle_id'],
    ['an unknown field in a count', (deck_id) => ({ deck_id, counts: [{ oracle_id: forest, count: 8, name: 'Forest' }] }), 'counts[0].name'],
    [
      'a card that repeats',
      (deck_id) => ({
        deck_id,
        counts: [
          { oracle_id: forest, count: 8 },
          { oracle_id: forest, count: 9 },
        ],
      }),
      'counts[1].oracle_id',
    ],
    ['an unknown field', (deck_id) => ({ deck_id, counts: [], revision: 0 }), 'revision'],
  ])('%s is refused with invalid_argument, and nothing changes', async (_, request, field) => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');

    const { error } = await setBasicLands(user.client, request(deckId));

    expect(error).toMatchObject({ code: 'invalid_argument', field });
    expect((await deckOf(user, deckId)).revision).toBe(0);
  });

  test('a deck that does not exist is not_found on deck_id', async () => {
    const user = await signUpNewUser();

    const { error } = await setBasicLands(user.client, { deck_id: crypto.randomUUID(), counts: [{ oracle_id: forest, count: 8 }] });

    expect(error).toMatchObject({ code: 'not_found', field: 'deck_id' });
  });
});

describe('access', () => {
  test("a user cannot set or read another user's basic lands", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const aliceDeck = await created(alice, 'Atraxa');
    await basicLandsSet(alice, aliceDeck, [{ oracle_id: forest, count: 8 }]);

    const { error } = await setBasicLands(bob.client, { deck_id: aliceDeck, counts: [{ oracle_id: forest, count: 1 }] });

    expect(error).toMatchObject({ code: 'not_found', field: 'deck_id' });
    expect(countsOf(await deckOf(alice, aliceDeck))).toEqual({ Forest: 8 });
    expect((await deckOf(alice, aliceDeck)).revision).toBe(1);
    for (const table of ['deck_basic_lands', 'deck_change_basic_lands'] as const) {
      const { data, error: readError } = await bob.client.from(table).select('user_id').eq('user_id', alice.userId);
      expect(readError).toBeNull();
      expect(data).toEqual([]);
    }
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot set basic lands', async (_, client) => {
    const { error } = await client().rpc('set_basic_lands', {
      request: { deck_id: crypto.randomUUID(), counts: [] },
    });

    expect(error?.code).toBe(permissionDenied);
  });

  test('a user cannot write basic lands or their deck change lines directly', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user, 'Atraxa');
    await basicLandsSet(user, deckId, [{ oracle_id: forest, count: 8 }]);

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

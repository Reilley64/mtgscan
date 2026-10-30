import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  createUserTag,
  searchCollection,
  setCopyUserTag,
  type CardCondition,
  type CardLanguage,
  type CollectionQuery,
} from '../collection';
import { addDeckCard, createDeck, listBasicLandCards } from '../decks';
import { getCards, listCardPrintings, searchCatalog } from '../search';
import { catalogFixture, resetCardCatalog, runCatalogImport, runOracleTagImport, runPriceImport } from './catalog-import-command';
import { collectionCopies } from './collection-pages';
import { collectionEntryKey, seedCopies, seededCollectionEntryKey, type SeededCopies } from './copy-seeds';
import { call, failed, refused, replyOf } from './database-calls';
import { anonymousClient, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCuratorCard = 'cca29a9b-794f-4712-8e6c-36ce3da9cb8b';
const delverOfSecretsCard = 'edd531b9-f615-4399-8c8c-1c5e18c4acbf';

const printings = {
  angelicCuratorMh2: '332352c2-98f2-4eb8-b49a-026a39df227b',
  angelicCuratorUlg: 'c63ba2da-6dea-44ac-8439-527222da565b',
  delverInnistrad: '11bf83bb-c95b-4b4f-9a56-ce7a1816307a',
  blackLotusAlpha: 'b0faa7f2-b547-42c4-a810-839da50dadfe',
  fogAlpha: 'cfba606d-bb55-43ba-aa0c-299649958788',
  lightningBoltAlpha: 'd573ef03-4730-45aa-93dd-e45ac1dbaf4a',
  fogBankUrzasSaga: '6ade0d30-5a57-439e-95e8-5f865880031f',
  primevalTitanM11: 'feee9327-b937-46ba-a2aa-6c015ab6cdd5',
  counterspellAlpha: '0df55e3f-14de-46ef-b6b1-616618724d9e',
  jinnieFayNonfoilOnly: '018830b2-dff9-45f3-9cc2-dc5b2eec0e54',
};

function entry(cardPrintingId: string, changes: Omit<SeededCopies, 'card_printing_id'> = {}): SeededCopies {
  return { card_printing_id: cardPrintingId, ...changes };
}

const aliceEntries = {
  curator: entry(printings.angelicCuratorMh2, { quantity: 2 }),
  etchedCurator: entry(printings.angelicCuratorMh2, { finish: 'etched', condition: 'lightly_played' }),
  japaneseCurator: entry(printings.angelicCuratorUlg, { finish: 'foil', language: 'ja' }),
  protectedDelver: entry(printings.delverInnistrad, { quantity: 4, is_protected: true }),
  blackLotus: entry(printings.blackLotusAlpha, { condition: 'damaged' }),
  germanFog: entry(printings.fogAlpha, { condition: 'heavily_played', language: 'de' }),
  bolt: entry(printings.lightningBoltAlpha, { quantity: 3, condition: 'moderately_played' }),
  fogBank: entry(printings.fogBankUrzasSaga),
  frenchTitan: entry(printings.primevalTitanM11, { finish: 'foil', language: 'fr' }),
};

type EntryLabel = keyof typeof aliceEntries;

const everyLabel = Object.keys(aliceEntries) as EntryLabel[];

let alice: TestUser;
let bob: TestUser;
let aliceCopyIds: Record<EntryLabel, string[]>;
const labelOf = new Map(Object.entries(aliceEntries).map(([label, seed]) => [seededCollectionEntryKey(seed), label as EntryLabel]));
const bobEntries = [entry(printings.counterspellAlpha), entry(printings.angelicCuratorMh2, { quantity: 5 })];

function search(query: CollectionQuery, user: TestUser = alice) {
  return call(user.client, searchCollection, query);
}

function page(query: CollectionQuery, user: TestUser = alice) {
  return collectionCopies(user.client, query);
}

function labelOfRow(row: Parameters<typeof collectionEntryKey>[0]) {
  return labelOf.get(collectionEntryKey(row))!;
}

async function labels(query: CollectionQuery) {
  return [...new Set((await page({ limit: 50, ...query })).items.map(labelOfRow))].toSorted();
}

function labelsInOrder(rows: Parameters<typeof collectionEntryKey>[0][]) {
  return rows.map(labelOfRow).filter((label, index, all) => label !== all[index - 1]);
}

async function names(query: CollectionQuery) {
  return (await page(query)).items.map((row) => row.name);
}

function everyLabelExcept(...excluded: EntryLabel[]) {
  return everyLabel.filter((label) => !excluded.includes(label)).toSorted();
}

function withIssueTime(cursor: string, issuedAt: number) {
  const payload = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  return Buffer.from(JSON.stringify({ ...payload, issued_at: issuedAt })).toString('base64');
}

async function allPages<Page extends { next_cursor: string | null }>(pageAt: (cursor: string | null) => Promise<Page>) {
  const pages: Page[] = [];
  let cursor: string | null = null;
  do {
    const next = await pageAt(cursor);
    pages.push(next);
    cursor = next.next_cursor;
  } while (cursor);
  return pages;
}

beforeAll(async () => {
  [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
});

describe('before the first catalog import', () => {
  beforeAll(resetCardCatalog);

  test('collection search returns data_unavailable', async () => {
    expect(await search({})).toMatchObject(refused('data_unavailable'));
  });
});

describe('after a catalog import', () => {
  beforeAll(async () => {
    const manifest = await catalogFixture({});
    expect((await runCatalogImport(manifest)).exitCode).toBe(0);
    expect((await runPriceImport(manifest)).exitCode).toBe(0);
    const seededCopyIds = await seedCopies(alice, Object.values(aliceEntries));
    aliceCopyIds = Object.fromEntries(everyLabel.map((label, index) => [label, seededCopyIds[index]!])) as Record<
      EntryLabel,
      string[]
    >;
    await seedCopies(bob, bobEntries);
  });

  describe('callers', () => {
    test("a user's collection search returns only their own copies", async () => {
      const aliceEntryKeys = new Set((await page({ limit: 50 })).items.map(collectionEntryKey));
      const bobEntryKeys = new Set((await page({ limit: 50 }, bob)).items.map(collectionEntryKey));

      expect([...aliceEntryKeys].toSorted()).toEqual([...labelOf.keys()].toSorted());
      expect([...bobEntryKeys].toSorted()).toEqual(bobEntries.map(seededCollectionEntryKey).toSorted());
    });

    test("another user's copies never appear, whatever the chips", async () => {
      const { items } = await page({ names: ['counterspell'] });

      expect(items).toEqual([]);
    });

    test('an anonymous caller is refused', async () => {
      expect(await call(anonymousClient(), searchCollection, {})).toMatchObject(failed(permissionDenied));
    });

    test('the secret key is refused', async () => {
      expect(await call(secretKeyClient(), searchCollection, {})).toMatchObject(failed(permissionDenied));
    });
  });

  describe('result rows', () => {
    test('sort by name returns every copy from A to Z, including cards that are not Commander-legal', async () => {
      const { items } = await page({ sort: 'name' });

      expect(items.map((row) => row.name)).toEqual([
        ...Array(4).fill('Angelic Curator'),
        'Black Lotus',
        ...Array(4).fill('Delver of Secrets // Insectile Aberration'),
        'Fog',
        'Fog Bank',
        ...Array(3).fill('Lightning Bolt'),
        'Primeval Titan',
      ]);
    });

    test('a row includes Oracle text when asked', async () => {
      const [fog] = (await page({ names: ['fog'], names_exclude: ['bank'], include_oracle_text: true })).items;

      expect(fog!.oracle_text).toBe('Prevent all combat damage that would be dealt this turn.');
    });

    test('a text search ranks an exact name first', async () => {
      expect(await names({ text: 'fog' })).toEqual(['Fog', 'Fog Bank']);
    });
  });

  describe('chips', () => {
    test.each<[string, CollectionQuery, EntryLabel[]]>([
      ['a name chip matches the card name', { names: ['curator'] }, ['curator', 'etchedCurator', 'japaneseCurator']],
      [
        'a type chip and a negated type chip match the type line',
        { types: ['creature'], types_exclude: ['angel'] },
        ['fogBank', 'frenchTitan', 'protectedDelver'],
      ],
      [
        'mana value bounds match the card mana value',
        { mana_value_min: 2, mana_value_max: 2 },
        ['curator', 'etchedCurator', 'fogBank', 'japaneseCurator'],
      ],
      ['a color chip matches the card colors', { colors: ['G'] }, ['frenchTitan', 'germanFog']],
      [
        'a negated color chip leaves out cards of that color',
        { colors_exclude: ['G'] },
        everyLabelExcept('frenchTitan', 'germanFog'),
      ],
      [
        'a color identity chip matches cards that fit the deck',
        { identity_subset_of: ['W'] },
        ['blackLotus', 'curator', 'etchedCurator', 'japaneseCurator'],
      ],
      ["a set chip matches the copy's own card printing", { sets: ['mh2'] }, ['curator', 'etchedCurator']],
      [
        "a negated set chip leaves out the copy's own card printing",
        { names: ['curator'], sets_exclude: ['mh2'] },
        ['japaneseCurator'],
      ],
      [
        "a rarity chip matches the copy's own card printing",
        { rarities: ['common'] },
        ['germanFog', 'japaneseCurator', 'protectedDelver', 'bolt'],
      ],
      [
        "a negated rarity chip leaves out the copy's own card printing",
        { names: ['curator'], rarities_exclude: ['common'] },
        ['curator', 'etchedCurator'],
      ],
      ['a finish chip matches the copy finish', { finishes: ['foil'] }, ['frenchTitan', 'japaneseCurator']],
      [
        'a negated finish chip leaves out that finish',
        { finishes_exclude: ['nonfoil'] },
        ['etchedCurator', 'frenchTitan', 'japaneseCurator'],
      ],
      ['two finish chips must both match, so no copy matches', { finishes: ['foil', 'etched'] }, []],
      [
        'a condition chip matches the copy condition',
        { conditions: ['lightly_played'] },
        ['etchedCurator'],
      ],
      [
        'a negated condition chip leaves out that condition',
        { conditions_exclude: ['near_mint'] },
        ['blackLotus', 'etchedCurator', 'germanFog', 'bolt'],
      ],
      [
        'two condition chips must both match, so no copy matches',
        { conditions: ['near_mint', 'damaged'] },
        [],
      ],
      ['a language chip matches the copy language', { languages: ['ja'] }, ['japaneseCurator']],
      [
        'negated language chips leave out each language',
        { languages_exclude: ['en', 'ja'] },
        ['frenchTitan', 'germanFog'],
      ],
      ['two language chips must both match, so no copy matches', { languages: ['en', 'ja'] }, []],
      ['the is protected chip matches protected copies', { is_protected: true }, ['protectedDelver']],
      [
        'the negated is protected chip leaves out protected copies',
        { is_protected: false },
        everyLabelExcept('protectedDelver'),
      ],
      ['the is free chip counts a protected copy as a free copy', { is_free: true }, everyLabel],
      ['the negated is free chip matches no copy while every copy is free', { is_free: false }, []],
      [
        'the is free chip with the negated is protected chip leaves out protected copies',
        { is_free: true, is_protected: false },
        everyLabelExcept('protectedDelver'),
      ],
    ])('%s', async (_, query, expected) => {
      expect(await labels(query)).toEqual(expected.toSorted());
    });

    test.each<[string, CollectionQuery, EntryLabel[]]>([
      ['a price bound uses the price of the exact card printing and finish', { price_max: '0.25' }, ['curator']],
      [
        'a price chip with two bounds keeps prices between them',
        { price_min: '1.00', price_max: '2.00' },
        ['fogBank', 'japaneseCurator'],
      ],
      ['a copy with no USD price never matches a price bound', { price_min: '0' }, everyLabelExcept('blackLotus')],
    ])('%s', async (_, query, expected) => {
      expect(await labels(query)).toEqual(expected.toSorted());
    });

    test('catalog search refuses the collection chips', async () => {
      for (const field of ['finishes', 'conditions', 'languages', 'deck_ids', 'is_free', 'is_protected', 'is_allocated', 'rows']) {
        const result = await call(alice.client, searchCatalog, { text: 'fog', [field]: field.startsWith('is_') ? true : ['x'] });

        expect(result).toMatchObject(refused('invalid_argument', field));
      }
    });
  });

  describe('user tag chips', () => {
    async function createdUserTag(user: TestUser, name: string) {
      return (await replyOf(user.client, createUserTag, { name })).user_tag_id;
    }

    async function putOnCopies(user: TestUser, userTagId: string, copyIds: string[]) {
      for (const copyId of copyIds) {
        await replyOf(user.client, setCopyUserTag, { copy_id: copyId, user_tag_id: userTagId, tagged: true });
      }
    }

    async function quantities(query: CollectionQuery) {
      const counts: Partial<Record<EntryLabel, number>> = {};
      for (const label of (await page({ limit: 50, ...query })).items.map(labelOfRow)) {
        counts[label] = (counts[label] ?? 0) + 1;
      }
      return counts;
    }

    beforeAll(async () => {
      const signed = await createdUserTag(alice, 'Signed');
      const tradeBinder = await createdUserTag(alice, 'Trade binder');
      await putOnCopies(alice, signed, [aliceCopyIds.curator[0]!, aliceCopyIds.bolt[0]!]);
      await putOnCopies(alice, tradeBinder, [aliceCopyIds.curator[1]!, aliceCopyIds.bolt[0]!, aliceCopyIds.bolt[1]!]);
      await createdUserTag(bob, 'Proxy');
    });

    test('a user tag chip matches copies with that user tag, ignoring case', async () => {
      expect(await quantities({ user_tags: ['SIGNED'] })).toEqual({ curator: 1, bolt: 1 });
    });

    test('a copy matches two user tag chips only when it has both user tags', async () => {
      expect(await quantities({ user_tags: ['signed', 'trade binder'] })).toEqual({ bolt: 1 });
    });

    test('negated user tag chips leave out copies that have any of the user tags, ignoring case', async () => {
      const left = await quantities({ user_tags_exclude: ['Signed', 'TRADE BINDER'] });

      expect(Object.keys(left).toSorted()).toEqual(everyLabelExcept('curator'));
      expect(left.bolt).toBe(1);
    });

    test('a user tag chip leaves out the other copies of the same card printing', async () => {
      expect(await quantities({ user_tags: ['Trade binder'] })).toEqual({ curator: 1, bolt: 2 });
    });

    test('a user tag chip returns each matching copy', async () => {
      const { items } = await collectionCopies(alice.client, { user_tags: ['signed'] });

      expect(items.map((row) => row.copy_id).toSorted()).toEqual(
        [aliceCopyIds.curator[0]!, aliceCopyIds.bolt[0]!].toSorted(),
      );
    });

    test.each<[string, CollectionQuery, string]>([
      ['a user tag name that the user does not have', { user_tags: ['signed', 'signd'] }, 'user_tags[1]'],
      ["another user's user tag name", { user_tags_exclude: ['proxy'] }, 'user_tags_exclude[0]'],
    ])('%s is refused with invalid_argument on that list item', async (_, query, field) => {
      expect(await search(query)).toMatchObject(refused('invalid_argument', field));
    });

    test('catalog search refuses user tag chips', async () => {
      const result = await call(alice.client, searchCatalog, { text: 'fog', user_tags: ['signed'] } as never);

      expect(result).toMatchObject(refused('invalid_argument', 'user_tags'));
    });
  });

  describe('deck chips', () => {
    let carol: TestUser;
    let carolCopyIds: string[];
    let atraxa: string;
    let kinnan: string;
    let bobDeck: string;

    async function createdDeck(user: TestUser, name: string) {
      return (await replyOf(user.client, createDeck, { name })).deck_id;
    }

    async function addedToDeck(user: TestUser, deckId: string, copyId: string) {
      await replyOf(user.client, addDeckCard, { deck_id: deckId, copy_id: copyId, unprotect: false });
    }

    async function copyRows(query: CollectionQuery) {
      return (await collectionCopies(carol.client, query)).items;
    }

    async function copyIds(query: CollectionQuery) {
      return (await copyRows(query)).map((row) => row.copy_id).toSorted();
    }

    function sorted(...ids: (string | undefined)[]) {
      return (ids as string[]).toSorted();
    }

    beforeAll(async () => {
      carol = await signUpNewUser();
      carolCopyIds = (await seedCopies(carol, [entry(printings.angelicCuratorMh2, { quantity: 3 }), entry(printings.lightningBoltAlpha)])).flat();
      atraxa = await createdDeck(carol, 'Atraxa');
      kinnan = await createdDeck(carol, 'Kinnan');
      await addedToDeck(carol, atraxa, carolCopyIds[0]!);
      await addedToDeck(carol, kinnan, carolCopyIds[1]!);
      await addedToDeck(carol, kinnan, carolCopyIds[3]!);
      bobDeck = await createdDeck(bob, 'Atraxa');
    });

    test('is_allocated true matches copies in a deck, and false matches copies in no deck', async () => {
      expect(await copyIds({ is_allocated: true })).toEqual(sorted(carolCopyIds[0], carolCopyIds[1], carolCopyIds[3]));
      expect(await copyIds({ is_allocated: false })).toEqual(sorted(carolCopyIds[2]));
    });

    test('deck_ids matches copies in any of the listed decks', async () => {
      expect(await copyIds({ deck_ids: [kinnan] })).toEqual(sorted(carolCopyIds[1], carolCopyIds[3]));
      expect(await copyIds({ deck_ids: [atraxa, kinnan] })).toEqual(sorted(carolCopyIds[0], carolCopyIds[1], carolCopyIds[3]));
    });

    test('deck_ids_exclude leaves out copies in any of the listed decks', async () => {
      expect(await copyIds({ deck_ids_exclude: [kinnan] })).toEqual(sorted(carolCopyIds[0], carolCopyIds[2]));
      expect(await copyIds({ deck_ids_exclude: [atraxa, kinnan] })).toEqual(sorted(carolCopyIds[2]));
    });

    test('a copy row returns the deck ID and name of its deck, or null for a copy in no deck', async () => {
      const decks = Object.fromEntries((await copyRows({})).map((row) => [row.copy_id, row.deck]));

      expect(decks).toEqual({
        [carolCopyIds[0]!]: { deck_id: atraxa, name: 'Atraxa' },
        [carolCopyIds[1]!]: { deck_id: kinnan, name: 'Kinnan' },
        [carolCopyIds[2]!]: null,
        [carolCopyIds[3]!]: { deck_id: kinnan, name: 'Kinnan' },
      });
    });

    test.each(['deck_ids', 'deck_ids_exclude'])(
      "%s refuses another user's deck ID and an unknown deck ID on its item",
      async (field) => {
        for (const [deckIds, refusedIndex] of [
          [[atraxa, bobDeck], 1],
          [[crypto.randomUUID(), kinnan], 0],
        ] as const) {
          expect(await search({ [field]: deckIds }, carol)).toMatchObject({
            status: 'refused',
            refusal: { code: 'invalid_argument', field: `${field}[${refusedIndex}]`, message: expect.stringContaining('not one of your decks') },
          });
        }
      },
    );

    test.each<[string, Record<string, unknown>, string]>([
      ['a deck ID that is not a UUID', { deck_ids: ['deck-1'] }, 'deck_ids[0]'],
      [
        'a repeated deck ID',
        { deck_ids: ['7b0f3a9e-2c4d-4e8f-9a1b-3c5d7e9f1a2b', '7b0f3a9e-2c4d-4e8f-9a1b-3c5d7e9f1a2b'] },
        'deck_ids[1]',
      ],
      [
        'more than 10 deck IDs',
        { deck_ids_exclude: Array.from({ length: 11 }, () => crypto.randomUUID()) },
        'deck_ids_exclude',
      ],
      ['an empty list of deck IDs', { deck_ids: [] }, 'deck_ids'],
    ])('%s is refused with an error on its field', async (_, query, field) => {
      expect(await search(query as never)).toMatchObject(refused('invalid_argument', field));
    });
  });

  describe('basic lands', () => {
    const regularBasicLands = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
    const snowCoveredBasicLands = regularBasicLands.map((name) => `Snow-Covered ${name}`);
    const everyBasicLand = [...regularBasicLands, ...snowCoveredBasicLands];
    let dave: TestUser;
    let daveDeck: string;

    async function basicLandNames(query: CollectionQuery, user: TestUser = dave) {
      return (await replyOf(user.client, searchCollection, query)).basic_lands?.map((land) => land.name);
    }

    beforeAll(async () => {
      dave = await signUpNewUser();
      await seedCopies(dave, [entry(printings.angelicCuratorMh2, { quantity: 2 })]);
      await replyOf(dave.client, createUserTag, { name: 'Signed' });
      daveDeck = (await replyOf(dave.client, createDeck, { name: 'Atraxa' })).deck_id;
      expect((await runOracleTagImport(await catalogFixture({}))).exitCode).toBe(0);
    });

    test('a query with no text and no chips returns every basic land card of list_basic_land_cards, in order', async () => {
      const { basic_lands } = await replyOf(dave.client, searchCollection, {});

      expect(basic_lands).toEqual((await replyOf(dave.client, listBasicLandCards)).items);
      expect(basic_lands?.map((land) => land.name)).toEqual(everyBasicLand);
    });

    test('the sort, limit, and Oracle text fields are not chips, so every basic land card still matches', async () => {
      expect(await basicLandNames({ sort: 'name', sort_order: 'desc', limit: 1, include_oracle_text: true })).toEqual(
        everyBasicLand,
      );
    });

    test('a query with no text and no chips returns no basic land card for a collection with no copies', async () => {
      expect(await basicLandNames({}, await signUpNewUser())).toEqual([]);
    });

    test('search text matches basic land cards for a collection with no copies', async () => {
      expect(await basicLandNames({ text: 'island' }, await signUpNewUser())).toEqual(['Island', 'Snow-Covered Island']);
    });

    test('only the first page returns basic land cards', async () => {
      const first = await replyOf(dave.client, searchCollection, { limit: 1 });
      const next = await replyOf(dave.client, searchCollection, { limit: 1, cursor: first.next_cursor });

      expect(first.basic_lands).toHaveLength(12);
      expect(next.basic_lands).toBeNull();
    });

    test.each<[string, CollectionQuery, string[]]>([
      ['a word of the name', { text: 'island' }, ['Island', 'Snow-Covered Island']],
      ['words of the name and the type line', { text: 'snow forest' }, ['Snow-Covered Forest']],
      ['a word of the type line', { text: 'land' }, everyBasicLand],
      ['the basic supertype', { text: 'basic' }, everyBasicLand],
      ['a plural of the name', { text: 'islands' }, ['Island', 'Snow-Covered Island']],
      ['a name without its hyphen', { text: 'snowcovered' }, snowCoveredBasicLands],
      ['quoted words of the name', { text: '"snow covered"' }, snowCoveredBasicLands],
      ['text that matches no basic land card', { text: 'curator' }, []],
    ])('search text matches basic land cards as it matches copies: %s', async (_, query, expected) => {
      expect(await basicLandNames(query)).toEqual(expected);
    });

    test.each<[string, CollectionQuery, string[]]>([
      ['a name chip', { names: ['mountain'] }, ['Mountain', 'Snow-Covered Mountain']],
      ['a name chip without the hyphen', { names: ['snowcovered'] }, snowCoveredBasicLands],
      ['a negated name chip', { names_exclude: ['snow'] }, regularBasicLands],
      ['a type chip', { types: ['snow'] }, snowCoveredBasicLands],
      ['a negated type chip', { types_exclude: ['snow'] }, regularBasicLands],
      ['a colorless chip', { colors: ['C'] }, everyBasicLand],
      ['a color chip', { colors: ['U'] }, []],
      ['a negated colorless chip', { colors_exclude: ['C'] }, []],
      [
        'a color identity chip',
        { identity_subset_of: ['U'] },
        ['Island', 'Wastes', 'Snow-Covered Island', 'Snow-Covered Wastes'],
      ],
      ['a mana value bound that fits', { mana_value_max: 0 }, everyBasicLand],
      ['a mana value bound that does not fit', { mana_value_min: 1 }, []],
      ['a power bound', { power_min: 0 }, []],
      ['an upper power bound', { power_max: 5 }, []],
      ['a lower toughness bound', { toughness_min: 0 }, []],
      ['an upper toughness bound', { toughness_max: 5 }, []],
      ['a keyword chip', { keywords: ['flying'] }, []],
      ['a negated keyword chip', { keywords_exclude: ['flying'] }, everyBasicLand],
      ['an Oracle tag chip', { tags: ['ramp'] }, []],
      ['a negated Oracle tag chip', { tags_exclude: ['ramp'] }, everyBasicLand],
      ['the commander chip', { is_commander: true }, []],
      ['the negated commander chip', { is_commander: false }, everyBasicLand],
      ['the Game Changer chip', { is_game_changer: true }, []],
      ['the negated Game Changer chip', { is_game_changer: false }, everyBasicLand],
      ['search text with a card chip', { text: 'island', types: ['snow'] }, ['Snow-Covered Island']],
    ])('%s matches basic land cards as it matches copies', async (_, query, expected) => {
      expect(await basicLandNames(query)).toEqual(expected);
    });

    test.each<[string, () => CollectionQuery]>([
      ['a finish chip', () => ({ finishes: ['nonfoil'] })],
      ['a negated finish chip', () => ({ finishes_exclude: ['foil'] })],
      ['a condition chip', () => ({ conditions: ['near_mint'] })],
      ['a negated condition chip', () => ({ conditions_exclude: ['damaged'] })],
      ['a language chip', () => ({ languages: ['en'] })],
      ['a negated language chip', () => ({ languages_exclude: ['ja'] })],
      ['a deck chip', () => ({ deck_ids: [daveDeck] })],
      ['a negated deck chip', () => ({ deck_ids_exclude: [daveDeck] })],
      ['a user tag chip', () => ({ user_tags: ['signed'] })],
      ['a negated user tag chip', () => ({ user_tags_exclude: ['signed'] })],
      ['the free chip', () => ({ is_free: true })],
      ['the negated free chip', () => ({ is_free: false })],
      ['the protected chip', () => ({ is_protected: true })],
      ['the negated protected chip', () => ({ is_protected: false })],
      ['the allocated chip', () => ({ is_allocated: true })],
      ['the negated allocated chip', () => ({ is_allocated: false })],
      ['a lower price bound', () => ({ price_min: '0' })],
      ['an upper price bound', () => ({ price_max: '100' })],
    ])('%s, which only a copy has, hides every basic land card', async (_, query) => {
      expect(await basicLandNames({ text: 'island', ...query() })).toEqual([]);
    });

    test.each<[string, CollectionQuery]>([
      ['a set chip', { sets: ['khm'] }],
      ['a negated set chip', { sets_exclude: ['khm'] }],
      ['a rarity chip', { rarities: ['common'] }],
      ['a negated rarity chip', { rarities_exclude: ['uncommon'] }],
    ])('%s, which matches the card printing of a copy, hides every basic land card', async (_, query) => {
      expect(await basicLandNames({ text: 'island', ...query })).toEqual([]);
    });
  });

  describe('input checks', () => {
    test.each<[string, Record<string, unknown>, string]>([
      ['an unknown condition', { conditions: ['mint'] }, 'conditions[0]'],
      ['an unknown language', { languages_exclude: ['en', 'la'] }, 'languages_exclude[1]'],
      ['a language code in uppercase', { languages: ['EN'] }, 'languages[0]'],
      ['an unknown finish', { finishes: ['gilded'] }, 'finishes[0]'],
      ['a repeated condition', { conditions: ['damaged', 'damaged'] }, 'conditions[1]'],
      ['an is free value of the wrong type', { is_free: 'yes' }, 'is_free'],
      ['an is protected value of the wrong type', { is_protected: 1 }, 'is_protected'],
      ['an is allocated value of the wrong type', { is_allocated: 'yes' }, 'is_allocated'],
      ['an empty list of user tags', { user_tags: [] }, 'user_tags'],
      ['a user tag name that is not a string', { user_tags_exclude: [7] }, 'user_tags_exclude[0]'],
      ['a user tag name repeated in another case', { user_tags: ['Signed', 'signed'] }, 'user_tags[1]'],
      ['an unknown field', { user_tag: ['trade binder'] }, 'user_tag'],
    ])('%s is refused with an error on its field', async (_, query, field) => {
      expect(await search(query as never)).toMatchObject(refused('invalid_argument', field));
    });
  });

  describe('order', () => {
    test.each<[string, CollectionQuery, EntryLabel[]]>([
      [
        'sort by name in descending order lists cards from Z to A',
        { sort: 'name', sort_order: 'desc', names_exclude: ['curator'] },
        ['frenchTitan', 'bolt', 'fogBank', 'germanFog', 'protectedDelver', 'blackLotus'],
      ],
      [
        'sort by mana value lists the lowest mana value first',
        { sort: 'mana_value', names_exclude: ['curator'] },
        ['blackLotus', 'protectedDelver', 'germanFog', 'bolt', 'fogBank', 'frenchTitan'],
      ],
      [
        'sort by price lists the lowest price of the exact card printing and finish first, and missing prices last',
        { sort: 'price' },
        [
          'curator',
          'protectedDelver',
          'etchedCurator',
          'fogBank',
          'japaneseCurator',
          'frenchTitan',
          'germanFog',
          'bolt',
          'blackLotus',
        ],
      ],
      [
        'sort by price in descending order lists the highest price first, and missing prices last',
        { sort: 'price', sort_order: 'desc' },
        [
          'bolt',
          'germanFog',
          'frenchTitan',
          'japaneseCurator',
          'fogBank',
          'etchedCurator',
          'protectedDelver',
          'curator',
          'blackLotus',
        ],
      ],
      [
        'sort by EDHREC rank lists the best rank first, and missing ranks last',
        { sort: 'edhrec_rank', names_exclude: ['curator'] },
        ['bolt', 'germanFog', 'fogBank', 'protectedDelver', 'blackLotus', 'frenchTitan'],
      ],
    ])('%s', async (_, query, expected) => {
      const { items } = await page(query);

      expect(labelsInOrder(items)).toEqual(expected);
    });

    test('an empty query lists the newest copy first, as sort added does', async () => {
      const user = await signUpNewUser();
      await seedCopies(user, [
        entry(printings.fogAlpha, { added_at: '2026-10-01T09:00:00.000Z' }),
        entry(printings.blackLotusAlpha, { added_at: '2026-10-03T09:00:00.000Z' }),
        entry(printings.lightningBoltAlpha, { added_at: '2026-10-02T09:00:00.000Z' }),
        entry(printings.fogAlpha, { condition: 'damaged', added_at: '2026-10-04T09:00:00.000Z' }),
      ]);

      const newestFirst = (await page({}, user)).items.map((row) => row.name);
      const added = (await page({ sort: 'added' }, user)).items.map((row) => row.name);
      const oldestFirst = (await page({ sort: 'added', sort_order: 'asc' }, user)).items.map((row) => row.name);

      expect(newestFirst).toEqual(['Fog', 'Black Lotus', 'Lightning Bolt', 'Fog']);
      expect(added).toEqual(newestFirst);
      expect(oldestFirst).toEqual(['Fog', 'Lightning Bolt', 'Black Lotus', 'Fog']);
    });

    test("sort by release date uses the release date of the copy's own card printing", async () => {
      const oldestFirst = (await page({ names: ['curator'], sort: 'release_date' })).items;
      const newestFirst = (await page({ names: ['curator'], sort: 'release_date', sort_order: 'desc' })).items;

      expect(labelOf.get(collectionEntryKey(oldestFirst[0]!))).toBe('japaneseCurator');
      expect(labelOf.get(collectionEntryKey(newestFirst.at(-1)!))).toBe('japaneseCurator');
    });
  });

  describe('paging', () => {
    const conditions: CardCondition[] = [
      'near_mint',
      'lightly_played',
      'moderately_played',
      'heavily_played',
      'damaged',
    ];
    const languages: CardLanguage[] = ['en', 'ja', 'de', 'fr'];
    let collector: TestUser;
    let seeded: SeededCopies[];

    beforeAll(async () => {
      collector = await signUpNewUser();
      seeded = [printings.fogBankUrzasSaga, printings.angelicCuratorMh2, printings.delverInnistrad].flatMap(
        (cardPrintingId) =>
          conditions.flatMap((condition) =>
            languages.map((language) => entry(cardPrintingId, { condition, language })),
          ),
      );
      await seedCopies(collector, seeded);
    });

    test.each([undefined, 25])('pages of %p cover every copy once, from A to Z', async (limit) => {
      const pages = await allPages((cursor) => page({ limit, sort: 'name', cursor }, collector));
      const rows = pages.flatMap((next) => next.items);

      expect(pages.map((next) => next.items.length)).toEqual(limit === 25 ? [25, 25, 10] : [60]);
      expect(rows.map(collectionEntryKey).toSorted()).toEqual(seeded.map(seededCollectionEntryKey).toSorted());
      expect(rows.map((row) => row.name)).toEqual(
        ['Angelic Curator', 'Delver of Secrets // Insectile Aberration', 'Fog Bank'].flatMap((name) => Array(20).fill(name)),
      );
      expect(new Set(pages.map((next) => next.search_id)).size).toBe(1);
    });

    test('the first page counts every match, and later pages carry no count', async () => {
      const pages = await allPages((cursor) => replyOf(collector.client, searchCollection, { limit: 15, names: ['curator'], cursor }));

      expect(pages.map((next) => next.items.length)).toEqual([15, 5]);
      expect(pages.map((next) => next.total_count)).toEqual([20, null]);
    });

    test('a malformed cursor fails with invalid_cursor', async () => {
      expect(await search({ cursor: 'not a cursor' }, collector)).toMatchObject(refused('invalid_cursor', 'cursor'));
    });

    test('a cursor older than 15 minutes fails with invalid_cursor', async () => {
      const { next_cursor } = await page({ limit: 20 }, collector);
      const sixteenMinutesAgo = Date.now() / 1000 - 16 * 60;
      const result = await search({ cursor: withIssueTime(next_cursor!, sixteenMinutesAgo) }, collector);

      expect(result).toMatchObject(refused('invalid_cursor', 'cursor'));
    });

    test('a cursor from another query fails with invalid_cursor', async () => {
      const { next_cursor } = await page({ limit: 20 }, collector);
      const result = await search({ finishes: ['nonfoil'], cursor: next_cursor }, collector);

      expect(result).toMatchObject(refused('invalid_cursor', 'cursor'));
    });

    test('a cursor from catalog search fails with invalid_cursor', async () => {
      const { next_cursor } = await replyOf(collector.client, searchCatalog, { types: ['creature'] });
      const result = await search({ types: ['creature'], cursor: next_cursor }, collector);

      expect(result).toMatchObject(refused('invalid_cursor', 'cursor'));
    });
  });

  describe('telemetry', () => {
    test('a first page writes one collection row with the copy IDs of the page', async () => {
      const first = await page({ names: ['curator'] });

      const { data, error } = await secretKeyClient()
        .from('search_telemetry')
        .select('*')
        .eq('search_id', first.search_id)
        .single();

      expect(error).toBeNull();
      expect(data).toMatchObject({
        user_id: alice.userId,
        api: 'collection',
        caller: 'app',
        query: {
          names: ['curator'],
          sort: 'relevance',
          sort_order: 'desc',
          limit: 60,
        },
        result_count: 4,
        result_ids: first.items.map((row) => row.copy_id),
      });
    });

    test('later pages and refused input write no row', async () => {
      const telemetryCount = async () => {
        const { count } = await secretKeyClient()
          .from('search_telemetry')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', alice.userId);
        return count;
      };
      const first = await page({ limit: 2 });
      const before = await telemetryCount();

      await page({ limit: 2, cursor: first.next_cursor });
      await search({ conditions: ['mint'] } as never);

      expect(await telemetryCount()).toBe(before);
    });
  });

  describe('owned copies in catalog reads', () => {
    test("catalog search counts the caller's own copies of each card", async () => {
      const owned = async (user: TestUser, name: string) => {
        return (await replyOf(user.client, searchCatalog, { names: [name] })).items[0]!.owned;
      };

      expect(await owned(alice, 'angelic curator')).toEqual({
        quantity: 4,
        free_quantity: 4,
        protected_free_quantity: 0,
      });
      expect(await owned(alice, 'delver of secrets')).toEqual({
        quantity: 4,
        free_quantity: 4,
        protected_free_quantity: 4,
      });
      expect(await owned(bob, 'angelic curator')).toEqual({
        quantity: 5,
        free_quantity: 5,
        protected_free_quantity: 0,
      });
      expect(await owned(bob, 'delver of secrets')).toEqual({
        quantity: 0,
        free_quantity: 0,
        protected_free_quantity: 0,
      });
    });

    test('the search release check counts no owned copies while users own copies of the card', async () => {
      const { items } = await replyOf(secretKeyClient(), searchCatalog, { names: ['angelic curator'] });

      expect(items[0]!.owned).toEqual({
        quantity: 0,
        free_quantity: 0,
        protected_free_quantity: 0,
      });
    });

    test("card details count the caller's own copies of each card", async () => {
      const { items } = await replyOf(alice.client, getCards, { oracle_ids: [angelicCuratorCard, delverOfSecretsCard] });

      expect(items.map((card) => card.owned)).toEqual([
        { quantity: 4, free_quantity: 4, protected_free_quantity: 0 },
        { quantity: 4, free_quantity: 4, protected_free_quantity: 4 },
      ]);
    });

    test("a printing list shows the caller's owned quantity of each card printing", async () => {
      const owned = async (user: TestUser, ownedOnly: boolean) => {
        const { items } = await replyOf(user.client, listCardPrintings, { oracle_id: angelicCuratorCard, owned_only: ownedOnly });
        return items.map((row) => [row.set, row.owned_quantity]);
      };

      expect(await owned(alice, false)).toEqual([
        ['mh2', 3],
        ['ulg', 1],
      ]);
      expect(await owned(bob, false)).toEqual([
        ['mh2', 5],
        ['ulg', 0],
      ]);
      expect(await owned(bob, true)).toEqual([['mh2', 5]]);
    });
  });

  describe('after a card printing leaves the card catalog', () => {
    beforeAll(async () => {
      const manifest = await catalogFixture({
        updatedAt: '2026-10-22T21:00:00.000+00:00',
        defaultCards: (records) => records.filter((record) => record.id !== printings.angelicCuratorUlg),
      });
      expect((await runCatalogImport(manifest)).exitCode).toBe(0);
    });

    test('collection search still returns copies of the absent card printing', async () => {
      expect(await labels({ names: ['curator'] })).toEqual(['curator', 'etchedCurator', 'japaneseCurator']);
    });

    test('a printing list keeps an absent card printing only for a caller who owns it', async () => {
      const sets = async (user: TestUser) => {
        const { items } = await replyOf(user.client, listCardPrintings, { oracle_id: angelicCuratorCard });
        return items.map((row) => row.set);
      };

      expect(await sets(alice)).toEqual(['mh2', 'ulg']);
      expect(await sets(bob)).toEqual(['mh2']);
    });
  });
});

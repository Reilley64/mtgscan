import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type {
  CardCondition,
  CardLanguage,
  CollectionCopyRow,
  CollectionPage,
  CollectionQuery,
  CollectionRow,
  CurrentPrice,
  UserTag,
} from '../collection';
import type { Json } from '../database.types';
import { readSearchError, type CardDetails, type CardPrintingsPage, type CatalogRow, type SearchPage } from '../search';
import { catalogFixture, resetCardCatalog, runCatalogImport, runPriceImport } from './catalog-import-command';
import { collectionEntryKey, seedCopies, seededCollectionEntryKey, type SeededCopies } from './copy-seeds';
import { storeExchangeRates } from './exchange-rate-seeds';
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

async function search(query: CollectionQuery | Record<string, unknown> | unknown[], user: TestUser = alice) {
  const { data, error } = await user.client.rpc('search_collection', { query: query as Json });
  return { page: data as unknown as CollectionPage<CollectionRow> | null, error: error && readSearchError(error) };
}

async function page(query: CollectionQuery, user: TestUser = alice) {
  const { page, error } = await search(query, user);
  expect(error).toBeNull();
  return page!;
}

async function labels(query: CollectionQuery) {
  return (await page({ limit: 50, ...query })).items.map((row) => labelOf.get(collectionEntryKey(row))!).toSorted();
}

async function names(query: CollectionQuery) {
  return (await page(query)).items.map((row) => row.name);
}

function usdPrice(amount: string, finish: CurrentPrice['finish']): CurrentPrice {
  return { amount, currency: 'USD', finish, stale: false };
}

async function pricesAndTotals(query: CollectionQuery = {}) {
  return Object.fromEntries(
    (await page({ limit: 50, ...query })).items.map((row) => [labelOf.get(collectionEntryKey(row))!, [row.price, row.total]]),
  );
}

function everyLabelExcept(...excluded: EntryLabel[]) {
  return everyLabel.filter((label) => !excluded.includes(label)).toSorted();
}

function withIssueTime(cursor: string, issuedAt: number) {
  const payload = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  return Buffer.from(JSON.stringify({ ...payload, issued_at: issuedAt })).toString('base64');
}

async function allPages(query: CollectionQuery, user: TestUser) {
  const pages: CollectionPage<CollectionRow>[] = [];
  let cursor: string | null = null;
  do {
    const next = await page({ ...query, cursor }, user);
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
    const { page, error } = await search({});

    expect(page).toBeNull();
    expect(error?.code).toBe('data_unavailable');
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
    test("a user's collection search returns only their own collection entries", async () => {
      const aliceEntryKeys = (await page({ limit: 50 })).items.map(collectionEntryKey);
      const bobEntryKeys = (await page({ limit: 50 }, bob)).items.map(collectionEntryKey);

      expect(aliceEntryKeys.toSorted()).toEqual([...labelOf.keys()].toSorted());
      expect(bobEntryKeys.toSorted()).toEqual(bobEntries.map(seededCollectionEntryKey).toSorted());
    });

    test("another user's collection entries never appear, whatever the chips", async () => {
      const { items } = await page({ names: ['counterspell'] });

      expect(items).toEqual([]);
    });

    test('an anonymous caller is refused', async () => {
      const { data, error } = await anonymousClient().rpc('search_collection', { query: {} });

      expect(data).toBeNull();
      expect(error?.code).toBe(permissionDenied);
    });

    test('the secret key is refused', async () => {
      const { data, error } = await secretKeyClient().rpc('search_collection', { query: {} });

      expect(data).toBeNull();
      expect(error?.code).toBe(permissionDenied);
    });
  });

  describe('result rows', () => {
    test('sort by name returns every collection entry from A to Z, including cards that are not Commander-legal', async () => {
      const { items } = await page({ sort: 'name' });

      expect(items.map((row) => row.name)).toEqual([
        'Angelic Curator',
        'Angelic Curator',
        'Angelic Curator',
        'Black Lotus',
        'Delver of Secrets // Insectile Aberration',
        'Fog',
        'Fog Bank',
        'Lightning Bolt',
        'Primeval Titan',
      ]);
      expect(items.filter((row) => !row.commander_legal).map((row) => row.name)).toEqual([
        'Black Lotus',
        'Primeval Titan',
      ]);
    });

    test('a row is a collection entry: the copies that share a card printing, finish, condition, language, and protected flag, with their free, allocated, and held quantities', async () => {
      const { items, next_cursor, rules_stale, prices_observed_at, prices_stale } = await page({
        names: ['delver'],
      });

      expect(items).toEqual([
        {
          oracle_id: delverOfSecretsCard,
          printing_id: printings.delverInnistrad,
          name: 'Delver of Secrets // Insectile Aberration',
          set: 'isd',
          collector_number: '51',
          finish: 'nonfoil',
          language: 'en',
          condition: 'near_mint',
          protected: true,
          quantity: 4,
          free_quantity: 4,
          allocated_quantity: 0,
          held_quantity: 0,
          commander_legal: true,
          price: usdPrice('0.32', 'nonfoil'),
          total: '1.28',
        },
      ]);
      expect(next_cursor).toBeNull();
      expect(rules_stale).toBe(false);
      expect(prices_observed_at).not.toBeNull();
      expect(prices_stale).toBe(false);
    });

    test('a row includes Oracle text when asked', async () => {
      const [fog] = (await page({ names: ['fog'], names_exclude: ['bank'], include_oracle_text: true })).items;

      expect(fog!.oracle_text).toBe('Prevent all combat damage that would be dealt this turn.');
    });

    test('a text search ranks an exact name first', async () => {
      expect(await names({ text: 'fog' })).toEqual(['Fog', 'Fog Bank']);
    });
  });

  describe('current prices of collection entries', () => {
    test('each collection entry has the current price of its card printing and finish, whatever its condition and language, and its entry total', async () => {
      expect(await pricesAndTotals()).toEqual({
        curator: [usdPrice('0.21', 'nonfoil'), '0.42'],
        etchedCurator: [usdPrice('0.44', 'etched'), '0.44'],
        japaneseCurator: [usdPrice('1.97', 'foil'), '1.97'],
        protectedDelver: [usdPrice('0.32', 'nonfoil'), '1.28'],
        blackLotus: [null, null],
        germanFog: [usdPrice('62.96', 'nonfoil'), '62.96'],
        bolt: [usdPrice('626.67', 'nonfoil'), '1880.01'],
        fogBank: [usdPrice('1.11', 'nonfoil'), '1.11'],
        frenchTitan: [usdPrice('54.09', 'foil'), '54.09'],
      });
    });

    test('collection entries of the same card printing and finish have the same current price, whatever their condition and language', async () => {
      const user = await signUpNewUser();
      await seedCopies(user, [
        entry(printings.angelicCuratorMh2, { quantity: 2 }),
        entry(printings.angelicCuratorMh2, { condition: 'damaged', language: 'ja' }),
      ]);

      const { items } = await page({ limit: 50 }, user);

      expect(items.map((row) => [row.condition, row.language, row.price, row.total]).toSorted()).toEqual([
        ['damaged', 'ja', usdPrice('0.21', 'nonfoil'), '0.21'],
        ['near_mint', 'en', usdPrice('0.21', 'nonfoil'), '0.42'],
      ]);
    });

    test('a collection entry with no price for its finish has no price and no entry total, never the price of another finish', async () => {
      const user = await signUpNewUser();
      await seedCopies(user, [
        entry(printings.jinnieFayNonfoilOnly, { quantity: 2 }),
        entry(printings.jinnieFayNonfoilOnly, { finish: 'foil', quantity: 3 }),
      ]);

      const { items } = await page({ limit: 50 }, user);

      expect(items.map((row) => [row.finish, row.price, row.total]).toSorted()).toEqual([
        ['foil', null, null],
        ['nonfoil', usdPrice('4.41', 'nonfoil'), '8.82'],
      ]);
    });

    describe('when the current prices age', () => {
      let snapshotAt: string;

      beforeAll(async () => {
        const { data, error } = await secretKeyClient().from('import_snapshots').select('snapshot_at').eq('source', 'prices').single();
        expect(error).toBeNull();
        snapshotAt = data!.snapshot_at;
      });

      afterAll(async () => {
        await setPriceSnapshotAt(snapshotAt);
      });

      async function setPriceSnapshotAt(at: string) {
        const { error } = await secretKeyClient().from('import_snapshots').update({ snapshot_at: at }).eq('source', 'prices');
        expect(error).toBeNull();
      }

      function hoursAgo(hours: number) {
        return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      }

      async function staleFlags() {
        return (await page({ limit: 50 })).items.map((row) => row.price?.stale).toSorted();
      }

      test('every current price of a collection entry is stale once the price snapshot is more than 24 hours old', async () => {
        await setPriceSnapshotAt(hoursAgo(23.9));
        const fresh = await staleFlags();
        await setPriceSnapshotAt(hoursAgo(24.1));
        const aged = await staleFlags();

        expect(fresh).toEqual([...Array(8).fill(false), undefined]);
        expect(aged).toEqual([...Array(8).fill(true), undefined]);
      });
    });

    describe('with exchange rates stored', () => {
      beforeAll(async () => {
        await storeExchangeRates();
      });

      test('the current price and the entry total of a collection entry stay in USD, for an AI chat to convert', async () => {
        const { items } = await page({ names: ['delver'] });

        expect(items.map((row) => [row.price, row.total])).toEqual([[{ amount: '0.32', currency: 'USD', finish: 'nonfoil', stale: false }, '1.28']]);
      });
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
      ["a set chip matches the entry's own card printing", { sets: ['mh2'] }, ['curator', 'etchedCurator']],
      [
        "a negated set chip leaves out the entry's own card printing",
        { names: ['curator'], sets_exclude: ['mh2'] },
        ['japaneseCurator'],
      ],
      [
        "a rarity chip matches the entry's own card printing",
        { rarities: ['common'] },
        ['germanFog', 'japaneseCurator', 'protectedDelver', 'bolt'],
      ],
      [
        "a negated rarity chip leaves out the entry's own card printing",
        { names: ['curator'], rarities_exclude: ['common'] },
        ['curator', 'etchedCurator'],
      ],
      ['a finish chip matches the collection entry finish', { finishes: ['foil'] }, ['frenchTitan', 'japaneseCurator']],
      [
        'a negated finish chip leaves out that finish',
        { finishes_exclude: ['nonfoil'] },
        ['etchedCurator', 'frenchTitan', 'japaneseCurator'],
      ],
      ['two finish chips must both match, so no collection entry matches', { finishes: ['foil', 'etched'] }, []],
      [
        'a condition chip matches the collection entry condition',
        { conditions: ['lightly_played'] },
        ['etchedCurator'],
      ],
      [
        'a negated condition chip leaves out that condition',
        { conditions_exclude: ['near_mint'] },
        ['blackLotus', 'etchedCurator', 'germanFog', 'bolt'],
      ],
      [
        'two condition chips must both match, so no collection entry matches',
        { conditions: ['near_mint', 'damaged'] },
        [],
      ],
      ['a language chip matches the collection entry language', { languages: ['ja'] }, ['japaneseCurator']],
      [
        'negated language chips leave out each language',
        { languages_exclude: ['en', 'ja'] },
        ['frenchTitan', 'germanFog'],
      ],
      ['two language chips must both match, so no collection entry matches', { languages: ['en', 'ja'] }, []],
      ['the is protected chip matches protected collection entries', { is_protected: true }, ['protectedDelver']],
      [
        'the negated is protected chip leaves out protected collection entries',
        { is_protected: false },
        everyLabelExcept('protectedDelver'),
      ],
      ['the is free chip counts a protected copy as a free copy', { is_free: true }, everyLabel],
      ['the negated is free chip matches no collection entry while every copy is free', { is_free: false }, []],
      [
        'the is free chip with the negated is protected chip leaves out protected collection entries',
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
      ['an entry with no USD price never matches a price bound', { price_min: '0' }, everyLabelExcept('blackLotus')],
    ])('%s', async (_, query, expected) => {
      expect(await labels(query)).toEqual(expected.toSorted());
    });

    test('catalog search refuses the collection chips', async () => {
      for (const field of ['finishes', 'conditions', 'languages', 'deck_ids', 'is_free', 'is_protected', 'rows']) {
        const { data, error } = await alice.client.rpc('search_catalog', {
          query: { text: 'fog', [field]: field.startsWith('is_') ? true : ['x'] },
        });

        expect(data).toBeNull();
        expect(error && readSearchError(error)).toMatchObject({ code: 'invalid_argument', field });
      }
    });
  });

  describe('user tag chips', () => {
    async function createdUserTag(user: TestUser, name: string) {
      const { data, error } = await user.client.rpc('create_user_tag', { request: { name } });
      expect(error).toBeNull();
      return (data as unknown as UserTag).user_tag_id;
    }

    async function putOnCopies(user: TestUser, userTagId: string, copyIds: string[]) {
      for (const copyId of copyIds) {
        const { error } = await user.client.rpc('set_copy_user_tag', {
          request: { copy_id: copyId, user_tag_id: userTagId, tagged: true },
        });
        expect(error).toBeNull();
      }
    }

    async function quantities(query: CollectionQuery) {
      return Object.fromEntries(
        (await page({ limit: 50, ...query })).items.map((row) => [labelOf.get(collectionEntryKey(row))!, row.quantity]),
      );
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

    test('with rows entries, the quantity of each collection entry counts only its matching copies', async () => {
      expect(await quantities({ user_tags: ['Trade binder'] })).toEqual({ curator: 1, bolt: 2 });
    });

    test('with rows entries, the entry total of each collection entry counts only its matching copies', async () => {
      expect(await pricesAndTotals({ user_tags: ['Trade binder'] })).toEqual({
        curator: [usdPrice('0.21', 'nonfoil'), '0.21'],
        bolt: [usdPrice('626.67', 'nonfoil'), '1253.34'],
      });
    });

    test('with rows copies, a user tag chip returns each matching copy', async () => {
      const { items } = await page({ rows: 'copies', user_tags: ['signed'] });

      expect(items.map((row) => (row as unknown as CollectionCopyRow).copy_id).toSorted()).toEqual(
        [aliceCopyIds.curator[0]!, aliceCopyIds.bolt[0]!].toSorted(),
      );
    });

    test.each<[string, CollectionQuery, string]>([
      ['a user tag name that the user does not have', { user_tags: ['signed', 'signd'] }, 'user_tags[1]'],
      ["another user's user tag name", { user_tags_exclude: ['proxy'] }, 'user_tags_exclude[0]'],
    ])('%s is refused with invalid_argument on that list item', async (_, query, field) => {
      const { page, error } = await search(query);

      expect(page).toBeNull();
      expect(error).toMatchObject({ code: 'invalid_argument', field });
    });

    test('catalog search refuses user tag chips', async () => {
      const { data, error } = await alice.client.rpc('search_catalog', { query: { text: 'fog', user_tags: ['signed'] } });

      expect(data).toBeNull();
      expect(error && readSearchError(error)).toMatchObject({ code: 'invalid_argument', field: 'user_tags' });
    });
  });

  describe('deck chips', () => {
    test.each(['deck_ids', 'deck_ids_exclude'])('%s refuses any deck ID until decks exist', async (field) => {
      const { page, error } = await search({ [field]: [crypto.randomUUID()] });

      expect(page).toBeNull();
      expect(error).toMatchObject({ code: 'invalid_argument', field: `${field}[0]` });
      expect(error!.message).toContain('not one of your decks');
    });

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
      const { error } = await search(query);

      expect(error).toMatchObject({ code: 'invalid_argument', field });
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
      ['an empty list of user tags', { user_tags: [] }, 'user_tags'],
      ['a user tag name that is not a string', { user_tags_exclude: [7] }, 'user_tags_exclude[0]'],
      ['a user tag name repeated in another case', { user_tags: ['Signed', 'signed'] }, 'user_tags[1]'],
      ['an unknown field', { user_tag: ['trade binder'] }, 'user_tag'],
    ])('%s is refused with an error on its field', async (_, query, field) => {
      const { page, error } = await search(query);

      expect(page).toBeNull();
      expect(error).toMatchObject({ code: 'invalid_argument', field });
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

      expect(items.map((row) => labelOf.get(collectionEntryKey(row)))).toEqual(expected);
    });

    test('an empty query lists the card printing with the newest addition first, as sort added does', async () => {
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

      expect(newestFirst).toEqual(['Fog', 'Fog', 'Black Lotus', 'Lightning Bolt']);
      expect(added).toEqual(newestFirst);
      expect(oldestFirst).toEqual(['Lightning Bolt', 'Black Lotus', 'Fog', 'Fog']);
    });

    test("sort by release date uses the release date of the entry's own card printing", async () => {
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

    test.each([undefined, 50])('pages of %p cover every collection entry once, from A to Z', async (limit) => {
      const pages = await allPages({ limit, sort: 'name' }, collector);
      const rows = pages.flatMap((next) => next.items);

      expect(pages.map((next) => next.items.length)).toEqual(limit === 50 ? [50, 10] : [20, 20, 20]);
      expect(rows.map(collectionEntryKey).toSorted()).toEqual(seeded.map(seededCollectionEntryKey).toSorted());
      expect(rows.map((row) => row.name)).toEqual(
        ['Angelic Curator', 'Delver of Secrets // Insectile Aberration', 'Fog Bank'].flatMap((name) => Array(20).fill(name)),
      );
      expect(new Set(pages.map((next) => next.search_id)).size).toBe(1);
    });

    test.each(['entries', 'copies'] as const)(
      'with %s rows, the first page counts every match, and later pages carry no count',
      async (rows) => {
        const pages = await allPages({ rows, limit: 15, names: ['curator'] }, collector);

        expect(pages.map((next) => next.items.length)).toEqual([15, 5]);
        expect(pages.map((next) => next.total_count)).toEqual([20, null]);
      },
    );

    test('a malformed cursor fails with invalid_cursor', async () => {
      const { error } = await search({ cursor: 'not a cursor' }, collector);

      expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
    });

    test('a cursor older than 15 minutes fails with invalid_cursor', async () => {
      const { next_cursor } = await page({}, collector);
      const sixteenMinutesAgo = Date.now() / 1000 - 16 * 60;
      const { error } = await search({ cursor: withIssueTime(next_cursor!, sixteenMinutesAgo) }, collector);

      expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
    });

    test('a cursor from another query fails with invalid_cursor', async () => {
      const { next_cursor } = await page({}, collector);
      const { error } = await search({ finishes: ['nonfoil'], cursor: next_cursor }, collector);

      expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
    });

    test('a cursor from catalog search fails with invalid_cursor', async () => {
      const { data } = await collector.client.rpc('search_catalog', { query: { types: ['creature'] } });
      const { error } = await search(
        { types: ['creature'], cursor: (data as unknown as SearchPage<CatalogRow>).next_cursor },
        collector,
      );

      expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
    });
  });

  describe('telemetry', () => {
    test('a first page writes one collection row with a copy ID from each collection entry', async () => {
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
          rows: 'entries',
          sort: 'relevance',
          sort_order: 'desc',
          limit: 20,
        },
        result_count: 3,
      });
      const { data: copies } = await alice.client
        .from('copies')
        .select('id, card_printing_id, finish, condition, language, is_protected')
        .in('id', data!.result_ids);
      const entryKeyOfCopy = new Map(
        copies!.map((copy) => [
          copy.id,
          collectionEntryKey({ ...copy, printing_id: copy.card_printing_id, protected: copy.is_protected }),
        ]),
      );
      expect(data!.result_ids.map((copyId) => entryKeyOfCopy.get(copyId))).toEqual(first.items.map(collectionEntryKey));
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
      await search({ conditions: ['mint'] });

      expect(await telemetryCount()).toBe(before);
    });
  });

  describe('owned copies in catalog reads', () => {
    test("catalog search counts the caller's own copies of each card", async () => {
      const owned = async (user: TestUser, name: string) => {
        const { data } = await user.client.rpc('search_catalog', { query: { names: [name] } });
        return (data as unknown as SearchPage<CatalogRow>).items[0]!.owned;
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
      const { data, error } = await secretKeyClient().rpc('search_catalog', { query: { names: ['angelic curator'] } });

      expect(error).toBeNull();
      expect((data as unknown as SearchPage<CatalogRow>).items[0]!.owned).toEqual({
        quantity: 0,
        free_quantity: 0,
        protected_free_quantity: 0,
      });
    });

    test("card details count the caller's own copies of each card", async () => {
      const { data } = await alice.client.rpc('get_cards', {
        query: { oracle_ids: [angelicCuratorCard, delverOfSecretsCard] },
      });

      expect((data as unknown as CardDetails).items.map((card) => card.owned)).toEqual([
        { quantity: 4, free_quantity: 4, protected_free_quantity: 0 },
        { quantity: 4, free_quantity: 4, protected_free_quantity: 4 },
      ]);
    });

    test("a printing list shows the caller's owned quantity of each card printing", async () => {
      const owned = async (user: TestUser, ownedOnly: boolean) => {
        const { data } = await user.client.rpc('list_card_printings', {
          query: { oracle_id: angelicCuratorCard, owned_only: ownedOnly },
        });
        return (data as unknown as CardPrintingsPage).items.map((row) => [row.set, row.owned_quantity]);
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

    test('collection search still returns collection entries of the absent card printing', async () => {
      expect(await labels({ names: ['curator'] })).toEqual(['curator', 'etchedCurator', 'japaneseCurator']);
    });

    test('a printing list keeps an absent card printing only for a caller who owns it', async () => {
      const sets = async (user: TestUser) => {
        const { data } = await user.client.rpc('list_card_printings', { query: { oracle_id: angelicCuratorCard } });
        return (data as unknown as CardPrintingsPage).items.map((row) => row.set);
      };

      expect(await sets(alice)).toEqual(['mh2', 'ulg']);
      expect(await sets(bob)).toEqual(['mh2']);
    });
  });
});

import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import {
  readSearchError,
  type CardDetails,
  type CardDetailsQuery,
  type CardPrintingRow,
  type CardPrintingsPage,
  type CardPrintingsQuery,
} from '../search';
import {
  catalogFixture,
  catalogFixtureManifest,
  catalogFixtureSnapshotAt,
  resetCardCatalog,
  runCatalogImport,
  runPriceImport,
} from './catalog-import-command';
import { anonymousClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const delverOfSecrets = 'edd531b9-f615-4399-8c8c-1c5e18c4acbf';
const valakutAwakening = 'ff0ab867-b710-4b1a-baed-95fc3cf68f79';
const llanowarElves = '68954295-54e3-4303-a6bc-fc4547a4e3a3';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const delverSecretLair2023 = '888fbfaf-dbf9-4045-a79e-d436ef75b3cf';
const delverSecretLair2026 = 'a808459c-f086-4cb6-a53e-4b9e196c1000';
const unknownId = '00000000-0000-4000-8000-000000000000';

let alice: TestUser;
let jinnieFay: string;

beforeAll(async () => {
  alice = await signUpNewUser();
});

async function getCards(query: CardDetailsQuery | Record<string, unknown> | unknown[]) {
  const { data, error } = await alice.client.rpc('get_cards', { query: query as Json });
  return { result: data as unknown as CardDetails | null, error: error && readSearchError(error) };
}

async function cards(query: CardDetailsQuery) {
  const { result, error } = await getCards(query);
  expect(error).toBeNull();
  return result!;
}

async function listPrintings(query: CardPrintingsQuery | Record<string, unknown> | unknown[]) {
  const { data, error } = await alice.client.rpc('list_card_printings', { query: query as Json });
  return { page: data as unknown as CardPrintingsPage | null, error: error && readSearchError(error) };
}

async function printings(query: CardPrintingsQuery) {
  const { page, error } = await listPrintings(query);
  expect(error).toBeNull();
  return page!;
}

async function allPrintings(query: CardPrintingsQuery) {
  const rows: CardPrintingRow[] = [];
  const sizes: number[] = [];
  let cursor: string | null = null;
  do {
    const next = await printings({ ...query, cursor });
    rows.push(...next.items);
    sizes.push(next.items.length);
    cursor = next.next_cursor;
  } while (cursor);
  return { rows, sizes };
}

function printingKeys(rows: CardPrintingRow[]) {
  return rows.map((row) => `${row.set} ${row.collector_number}`);
}

function withIssueTime(cursor: string, issuedAt: number) {
  const payload = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  return Buffer.from(JSON.stringify({ ...payload, issued_at: issuedAt })).toString('base64');
}

describe('before the first catalog import', () => {
  beforeAll(resetCardCatalog);

  test('get cards returns data_unavailable', async () => {
    const { result, error } = await getCards({ oracle_ids: [delverOfSecrets] });

    expect(result).toBeNull();
    expect(error?.code).toBe('data_unavailable');
  });

  test('list printings returns data_unavailable', async () => {
    const { page, error } = await listPrintings({ oracle_id: delverOfSecrets });

    expect(page).toBeNull();
    expect(error?.code).toBe('data_unavailable');
  });
});

describe('after a catalog import', () => {
  beforeAll(async () => {
    expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
    const { data } = await alice.client
      .from('cards')
      .select('oracle_id')
      .eq('name', "Jinnie Fay, Jetmir's Second")
      .single();
    jinnieFay = data!.oracle_id;
  });

  describe('get cards', () => {
    test('a double-faced card returns full details with both faces', async () => {
      const { items, not_found, rules_data_as_of, rules_stale, prices_observed_at, prices_stale } = await cards({
        oracle_ids: [delverOfSecrets],
      });

      expect(items).toEqual([
        {
          oracle_id: delverOfSecrets,
          name: 'Delver of Secrets // Insectile Aberration',
          mana_cost: '{U} // ',
          mana_value: 1,
          type_line: 'Creature — Human Wizard // Creature — Human Insect',
          oracle_text:
            'At the beginning of your upkeep, look at the top card of your library. You may reveal that card. ' +
            'If an instant or sorcery card is revealed this way, transform this creature. // Flying',
          colors: ['U'],
          color_identity: ['U'],
          keywords: ['Flying', 'Transform'],
          faces: [
            {
              name: 'Delver of Secrets',
              mana_cost: '{U}',
              type_line: 'Creature — Human Wizard',
              oracle_text:
                'At the beginning of your upkeep, look at the top card of your library. You may reveal that card. ' +
                'If an instant or sorcery card is revealed this way, transform this creature.',
              colors: ['U'],
              power: '1',
              toughness: '1',
            },
            {
              name: 'Insectile Aberration',
              mana_cost: '',
              type_line: 'Creature — Human Insect',
              oracle_text: 'Flying',
              colors: ['U'],
              power: '3',
              toughness: '2',
            },
          ],
          commander_legality: 'legal',
          can_be_commander: false,
          is_game_changer: false,
          edhrec_rank: 16194,
          released_at: '2011-09-30',
          printing_count: 3,
          price_from: null,
          owned: { quantity: 0, free_quantity: 0, protected_free_quantity: 0 },
        },
      ]);
      expect(not_found).toEqual([]);
      expect(new Date(rules_data_as_of).toISOString()).toBe(new Date(catalogFixtureSnapshotAt).toISOString());
      expect(rules_stale).toBe(false);
      expect(prices_observed_at).toBeNull();
      expect(prices_stale).toBe(true);
    });

    test('cards come back in the order of the IDs, and unknown IDs are reported', async () => {
      const { items, not_found } = await cards({ oracle_ids: [valakutAwakening, unknownId, delverOfSecrets] });

      expect(items.map((card) => card.name)).toEqual([
        'Valakut Awakening // Valakut Stoneforge',
        'Delver of Secrets // Insectile Aberration',
      ]);
      expect(not_found).toEqual([unknownId]);
    });

    test('a modal double-faced card keeps a face with no colors', async () => {
      const [valakut] = (await cards({ oracle_ids: [valakutAwakening] })).items;

      expect(valakut!.faces.map((face) => [face.name, face.colors])).toEqual([
        ['Valakut Awakening', ['R']],
        ['Valakut Stoneforge', []],
      ]);
    });

    test('cards that are not Commander-legal are read with their Commander legality', async () => {
      const { data } = await alice.client
        .from('cards')
        .select('oracle_id')
        .in('name', ['Black Lotus', 'Sword of Dungeons & Dragons']);
      const { items } = await cards({ oracle_ids: data!.map((card) => card.oracle_id) });

      expect(Object.fromEntries(items.map((card) => [card.name, card.commander_legality]))).toEqual({
        'Black Lotus': 'banned',
        'Sword of Dungeons & Dragons': 'not_legal',
      });
    });

    test('up to 20 IDs are read at once', async () => {
      const ids = [delverOfSecrets, ...Array.from({ length: 19 }, () => crypto.randomUUID())];
      const { items, not_found } = await cards({ oracle_ids: ids });

      expect(items).toHaveLength(1);
      expect(not_found).toEqual(ids.slice(1));
    });

    test('printing IDs return the card with that printing and both faces', async () => {
      const { items, not_found } = await cards({ printing_ids: [delverSecretLair2023, unknownId, delverInnistrad] });

      expect(items.map((card) => [card.name, card.faces.length, card.printing])).toEqual([
        [
          'Delver of Secrets // Insectile Aberration',
          2,
          {
            printing_id: delverSecretLair2023,
            set: 'sld',
            set_name: 'Secret Lair Drop',
            collector_number: '722',
            rarity: 'rare',
            finishes: ['foil'],
            released_at: '2023-05-08',
          },
        ],
        [
          'Delver of Secrets // Insectile Aberration',
          2,
          {
            printing_id: delverInnistrad,
            set: 'isd',
            set_name: 'Innistrad',
            collector_number: '51',
            rarity: 'common',
            finishes: ['nonfoil', 'foil'],
            released_at: '2011-09-30',
          },
        ],
      ]);
      expect(not_found).toEqual([unknownId]);
    });

    test('Oracle IDs return no printing', async () => {
      const [delver] = (await cards({ oracle_ids: [delverOfSecrets] })).items;

      expect(delver).not.toHaveProperty('printing');
    });

    test('IDs in uppercase match the same cards', async () => {
      const { items } = await cards({ oracle_ids: [delverOfSecrets.toUpperCase()] });

      expect(items.map((card) => card.oracle_id)).toEqual([delverOfSecrets]);
    });

    test('unknown IDs are reported as the caller gave them', async () => {
      const unknownUppercase = 'ABCDEF00-0000-4000-8000-000000000000';
      const { not_found } = await cards({ printing_ids: [unknownUppercase] });

      expect(not_found).toEqual([unknownUppercase]);
    });
  });

  describe('list printings', () => {
    test('a double-faced card lists every paper printing newest first, with an image URL per face', async () => {
      const { items, next_cursor, rules_data_as_of, rules_stale } = await printings({ oracle_id: delverOfSecrets });

      expect(items).toEqual([
        {
          printing_id: delverSecretLair2026,
          set: 'sld',
          set_name: 'Secret Lair Drop',
          collector_number: '2367',
          rarity: 'rare',
          released_at: '2026-03-02',
          finishes: ['nonfoil', 'foil'],
          image_uris: [
            'https://cards.scryfall.io/normal/front/a/8/a808459c-f086-4cb6-a53e-4b9e196c1000.jpg?1783904222',
            'https://cards.scryfall.io/normal/back/a/8/a808459c-f086-4cb6-a53e-4b9e196c1000.jpg?1783904222',
          ],
          owned_quantity: 0,
        },
        {
          printing_id: delverSecretLair2023,
          set: 'sld',
          set_name: 'Secret Lair Drop',
          collector_number: '722',
          rarity: 'rare',
          released_at: '2023-05-08',
          finishes: ['foil'],
          image_uris: [
            'https://cards.scryfall.io/normal/front/8/8/888fbfaf-dbf9-4045-a79e-d436ef75b3cf.jpg?1783916540',
            'https://cards.scryfall.io/normal/back/8/8/888fbfaf-dbf9-4045-a79e-d436ef75b3cf.jpg?1783916540',
          ],
          owned_quantity: 0,
        },
        {
          printing_id: delverInnistrad,
          set: 'isd',
          set_name: 'Innistrad',
          collector_number: '51',
          rarity: 'common',
          released_at: '2011-09-30',
          finishes: ['nonfoil', 'foil'],
          image_uris: [
            'https://cards.scryfall.io/normal/front/1/1/11bf83bb-c95b-4b4f-9a56-ce7a1816307a.jpg?1783940984',
            'https://cards.scryfall.io/normal/back/1/1/11bf83bb-c95b-4b4f-9a56-ce7a1816307a.jpg?1783940984',
          ],
          owned_quantity: 0,
        },
      ]);
      expect(next_cursor).toBeNull();
      expect(new Date(rules_data_as_of).toISOString()).toBe(new Date(catalogFixtureSnapshotAt).toISOString());
      expect(rules_stale).toBe(false);
    });

    test('a card with one image per printing lists one image URL', async () => {
      const { items } = await printings({ oracle_id: llanowarElves });

      expect(items.map((row) => [row.set, row.image_uris])).toEqual([
        ['fdc', ['https://cards.scryfall.io/normal/front/5/3/5368ce20-0970-4630-8c46-439db2231a39.jpg?1789753284']],
        ['m12', ['https://cards.scryfall.io/normal/front/0/1/01c6f877-6b00-4d57-8a88-36cd3b16edbc.jpg?1783941058']],
        ['lea', ['https://cards.scryfall.io/normal/front/d/4/d4f1cc9e-4f99-4c26-ac1b-8ef069fa8ceb.jpg?1783948674']],
      ]);
    });

    test('printings on the same day keep a stable order by set and collector number', async () => {
      const { items } = await printings({ oracle_id: valakutAwakening });

      expect(printingKeys(items)).toEqual(['plst ZNR-174', 'pznr 174s', 'znr 355']);
    });

    test('a reversible card lists its printings with both faces', async () => {
      const { items } = await printings({ oracle_id: jinnieFay });

      expect(items.map((row) => [row.set, row.collector_number, row.image_uris.length])).toEqual([
        ['sld', '1510', 2],
        ['sld', '1556', 2],
        ['psnc', '195p', 1],
        ['snc', '313', 1],
      ]);
    });

    test.each([1, 2, 3, 4])('pages of %p cover every printing once, in order', async (limit) => {
      const { rows, sizes } = await allPrintings({ oracle_id: jinnieFay, limit });

      expect(printingKeys(rows)).toEqual(['sld 1510', 'sld 1556', 'psnc 195p', 'snc 313']);
      expect(sizes.reduce((total, size) => total + size, 0)).toBe(4);
      expect(sizes[0]).toBe(limit);
    });

    test('owned only lists no printings before collection entries exist', async () => {
      expect(await printings({ oracle_id: delverOfSecrets, owned_only: true })).toMatchObject({
        items: [],
        next_cursor: null,
      });
    });

    test('an unknown Oracle ID fails with not_found on oracle_id', async () => {
      const { page, error } = await listPrintings({ oracle_id: unknownId });

      expect(page).toBeNull();
      expect(error).toMatchObject({ code: 'not_found', field: 'oracle_id' });
    });

    test('a malformed cursor fails with invalid_cursor', async () => {
      const { error } = await listPrintings({ oracle_id: jinnieFay, cursor: 'not a cursor' });

      expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
    });

    test('a cursor with a broken sort key fails with invalid_cursor', async () => {
      const { next_cursor } = await printings({ oracle_id: jinnieFay, limit: 1 });
      const payload = JSON.parse(Buffer.from(next_cursor!, 'base64').toString('utf8'));
      const broken = Buffer.from(JSON.stringify({ ...payload, after: ['someday', 1, null, 'x'] })).toString('base64');
      const { error } = await listPrintings({ oracle_id: jinnieFay, limit: 1, cursor: broken });

      expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
    });

    test('a cursor from another card fails with invalid_cursor', async () => {
      const { next_cursor } = await printings({ oracle_id: jinnieFay, limit: 1 });
      const { error } = await listPrintings({ oracle_id: delverOfSecrets, limit: 1, cursor: next_cursor });

      expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
    });

    test('a cursor older than 15 minutes fails with invalid_cursor', async () => {
      const { next_cursor } = await printings({ oracle_id: jinnieFay, limit: 1 });
      const sixteenMinutesAgo = Date.now() / 1000 - 16 * 60;
      const { error } = await listPrintings({
        oracle_id: jinnieFay,
        limit: 1,
        cursor: withIssueTime(next_cursor!, sixteenMinutesAgo),
      });

      expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
    });
  });

  describe('input checks', () => {
    test.each<[string, Record<string, unknown>, string | null]>([
      ['get cards with no IDs', {}, 'oracle_ids'],
      ['get cards with both kinds of IDs', { oracle_ids: [delverOfSecrets], printing_ids: [delverInnistrad] }, 'printing_ids'],
      ['an unknown field', { oracle_ids: [delverOfSecrets], include_prices: true }, 'include_prices'],
      ['an empty ID list', { oracle_ids: [] }, 'oracle_ids'],
      ['an ID list of the wrong type', { oracle_ids: delverOfSecrets }, 'oracle_ids'],
      ['more than 20 IDs', { oracle_ids: Array.from({ length: 21 }, () => crypto.randomUUID()) }, 'oracle_ids'],
      ['an ID that is not a UUID', { oracle_ids: [delverOfSecrets, 'delver'] }, 'oracle_ids[1]'],
      ['an ID of the wrong type', { printing_ids: [7] }, 'printing_ids[0]'],
      ['a repeated ID', { oracle_ids: [delverOfSecrets, delverOfSecrets] }, 'oracle_ids[1]'],
      ['a repeated ID in another case', { oracle_ids: [delverOfSecrets, delverOfSecrets.toUpperCase()] }, 'oracle_ids[1]'],
    ])('get cards refuses %s with an error on its field', async (_, query, field) => {
      const { result, error } = await getCards(query);

      expect(result).toBeNull();
      expect(error).toMatchObject({ code: 'invalid_argument', field });
      if (field) {
        expect(error!.message).toContain(field.replace(/\[\d+\]$/, ''));
      }
    });

    test('get cards refuses a query that is not an object', async () => {
      const { error } = await getCards([delverOfSecrets]);

      expect(error).toMatchObject({ code: 'invalid_argument', field: null });
    });

    test.each<[string, Record<string, unknown>, string]>([
      ['no Oracle ID', {}, 'oracle_id'],
      ['an Oracle ID that is not a UUID', { oracle_id: 'delver' }, 'oracle_id'],
      ['an Oracle ID of the wrong type', { oracle_id: [delverOfSecrets] }, 'oracle_id'],
      ['an unknown field', { oracle_id: delverOfSecrets, set: 'isd' }, 'set'],
      ['owned only of the wrong type', { oracle_id: delverOfSecrets, owned_only: 'yes' }, 'owned_only'],
      ['a limit of 0', { oracle_id: delverOfSecrets, limit: 0 }, 'limit'],
      ['a limit above 50', { oracle_id: delverOfSecrets, limit: 51 }, 'limit'],
      ['a fractional limit', { oracle_id: delverOfSecrets, limit: 2.5 }, 'limit'],
      ['a cursor of the wrong type', { oracle_id: delverOfSecrets, cursor: 5 }, 'cursor'],
    ])('list printings refuses %s with an error on its field', async (_, query, field) => {
      const { page, error } = await listPrintings(query);

      expect(page).toBeNull();
      expect(error).toMatchObject({ code: 'invalid_argument', field });
      expect(error!.message).toContain(field);
    });

    test('list printings refuses a query that is not an object', async () => {
      const { error } = await listPrintings([delverOfSecrets]);

      expect(error).toMatchObject({ code: 'invalid_argument', field: null });
    });
  });

  describe('callers', () => {
    test.each(['get_cards', 'list_card_printings'] as const)('an anonymous caller is refused by %s', async (fn) => {
      const query = fn === 'get_cards' ? { oracle_ids: [delverOfSecrets] } : { oracle_id: delverOfSecrets };
      const { data, error } = await anonymousClient().rpc(fn, { query });

      expect(data).toBeNull();
      expect(error?.code).toBe(permissionDenied);
    });
  });
});

describe('after a price import', () => {
  beforeAll(async () => {
    expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
  });

  test('card details carry the lowest current price in USD over printings and finishes', async () => {
    const { items, prices_observed_at, prices_stale } = await cards({ oracle_ids: [delverOfSecrets, valakutAwakening] });

    expect(items.map((card) => [card.name, card.price_from])).toEqual([
      [
        'Delver of Secrets // Insectile Aberration',
        { currency: 'USD', amount: '0.32', finish: 'nonfoil', basis: 'lowest current price over printings and finishes' },
      ],
      [
        'Valakut Awakening // Valakut Stoneforge',
        { currency: 'USD', amount: '16.47', finish: 'nonfoil', basis: 'lowest current price over printings and finishes' },
      ],
    ]);
    expect(prices_observed_at).not.toBeNull();
    expect(prices_stale).toBe(false);
  });
});

describe('after a printing leaves the catalog', () => {
  beforeAll(async () => {
    const manifest = await catalogFixture({
      updatedAt: '2026-10-15T21:01:56.786+00:00',
      defaultCards: (records) => records.filter((record) => record.id !== delverSecretLair2023),
    });
    expect((await runCatalogImport(manifest)).exitCode).toBe(0);
  });

  test('list printings skips the absent printing', async () => {
    const { items } = await printings({ oracle_id: delverOfSecrets });

    expect(items.map((row) => row.printing_id)).toEqual([delverSecretLair2026, delverInnistrad]);
  });

  test('the printing count skips the absent printing', async () => {
    const [delver] = (await cards({ oracle_ids: [delverOfSecrets] })).items;

    expect(delver!.printing_count).toBe(2);
  });

  test('get cards still reads the absent printing by its ID', async () => {
    const { items, not_found } = await cards({ printing_ids: [delverSecretLair2023] });

    expect(items.map((card) => card.printing!.printing_id)).toEqual([delverSecretLair2023]);
    expect(not_found).toEqual([]);
  });
});

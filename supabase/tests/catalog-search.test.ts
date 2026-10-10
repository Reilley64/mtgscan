import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import { readSearchError, type CatalogQuery, type CatalogRow, type SearchPage } from '../search';
import {
  catalogFixture,
  catalogFixtureManifest,
  catalogFixtureSnapshotAt,
  resetCardCatalog,
  runCatalogImport,
  runPriceImport,
} from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const unknownLegalityCard = 'Sip of Hemlock';

let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
});

async function search(query: CatalogQuery | Record<string, unknown> | unknown[], user: TestUser = alice) {
  const { data, error } = await user.client.rpc('search_catalog', { query: query as Json });
  return { page: data as SearchPage<CatalogRow> | null, error: error && readSearchError(error) };
}

async function page(query: CatalogQuery) {
  const { page, error } = await search(query);
  expect(error).toBeNull();
  return page!;
}

async function names(query: CatalogQuery) {
  return (await page(query)).items.map((row) => row.name);
}

async function allPages(query: CatalogQuery) {
  const pages: SearchPage<CatalogRow>[] = [];
  let cursor: string | null = null;
  do {
    const next = await page({ ...query, cursor });
    pages.push(next);
    cursor = next.next_cursor;
  } while (cursor);
  return pages;
}

async function telemetryRows() {
  const { data, error } = await secretKeyClient()
    .from('search_telemetry')
    .select('*')
    .eq('user_id', alice.userId)
    .order('created_at');
  expect(error).toBeNull();
  return data!;
}

function withIssueTime(cursor: string, issuedAt: number) {
  const payload = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));
  return Buffer.from(JSON.stringify({ ...payload, issued_at: issuedAt })).toString('base64');
}

describe('before the first catalog import', () => {
  beforeAll(resetCardCatalog);

  test('catalog search returns data_unavailable', async () => {
    const { page, error } = await search({ text: 'fog' });

    expect(page).toBeNull();
    expect(error?.code).toBe('data_unavailable');
  });
});

describe('after a catalog import', () => {
  beforeAll(async () => {
    const manifest = await catalogFixture({
      oracleCards: (records) =>
        records.map((record) =>
          record.name === unknownLegalityCard
            ? { ...record, legalities: { ...(record.legalities as object), commander: undefined } }
            : record,
        ),
    });
    expect((await runCatalogImport(manifest)).exitCode).toBe(0);
  });

  describe('text search', () => {
    test('an exact name comes first, then other names that contain it', async () => {
      expect((await names({ text: 'fog' })).slice(0, 2)).toEqual(['Fog', 'Fog Bank']);
    });

    test('an exact face name comes before partial names', async () => {
      expect((await names({ text: 'stomp' }))[0]).toBe('Bonecrusher Giant // Stomp');
      expect((await names({ text: 'Fire' }))[0]).toBe('Fire // Ice');
      expect((await names({ text: 'warrant' })).slice(0, 2)).toEqual(['Warrant // Warden', 'Search Warrant']);
    });

    test('an exact full card name comes before another card with a face of that name', async () => {
      expect((await names({ text: 'swords to plowshares' })).slice(0, 2)).toEqual([
        'Swords to Plowshares',
        'Emeritus of Truce // Swords to Plowshares',
      ]);
    });

    test('a double-faced card comes first for its own face name', async () => {
      expect((await names({ text: 'delver of secrets' }))[0]).toBe('Delver of Secrets // Insectile Aberration');
      expect((await names({ text: 'the core' })).slice(0, 2)).toEqual([
        'Matzalantli, the Great Door // The Core',
        'Firdoch Core',
      ]);
    });

    test('a partial name finds every card whose name contains it', async () => {
      expect(await names({ text: 'chupaca' })).toEqual(['Lurking Chupacabra']);
    });

    test('name matches come before type line matches, and type line matches before Oracle text matches', async () => {
      const results = await names({ text: 'goblin' });

      expect(results[0]).toBe('Goblin Instigator');
      expect(results.slice(1, 5).sort()).toEqual(
        ['Akki Lavarunner // Tok-Tok, Volcano Born', 'Heirloom Auntie', 'Kiki-Jiki, Mirror Breaker', 'Krenko, Mob Boss'].sort(),
      );
      expect(results.slice(5)).toContain('Orcish Siegemaster');
    });

    test('keywords match like Oracle text', async () => {
      expect(await names({ text: 'flying', keywords: ['vigilance'] })).toEqual(
        expect.arrayContaining(["Atraxa, Praetors' Voice", 'Brisela, Voice of Nightmares', 'Bruna, the Fading Light', 'Zephyrim']),
      );
    });

    test.each(['Lightnig Bolt', 'Rhystic Studdy', 'Krenko Mob Bass'])('a misspelled name returns no results: %s', async (text) => {
      expect(await names({ text })).toEqual([]);
    });
  });

  describe('Commander legality', () => {
    test.each(['Black Lotus', 'Primeval Titan', 'Sword of Dungeons & Dragons', unknownLegalityCard])(
      '%s is not Commander-legal and never appears',
      async (name) => {
        expect(await names({ text: name })).not.toContain(name);
        expect(await names({ names: [name] })).toEqual([]);
      },
    );
  });

  describe('result rows', () => {
    test('a row joins faces and leaves out Oracle text unless asked', async () => {
      const { items, next_cursor, rules_data_as_of, rules_stale, prices_observed_at, prices_stale } = await page({
        names: ['Fire // Ice'],
      });

      expect(items).toEqual([
        {
          oracle_id: expect.any(String),
          name: 'Fire // Ice',
          mana_cost: '{1}{R} // {1}{U}',
          mana_value: 4,
          type_line: 'Instant // Instant',
          color_identity: ['R', 'U'],
          is_game_changer: false,
          can_be_commander: false,
          edhrec_rank: expect.any(Number),
          price_from: null,
          owned: { quantity: 0, free_quantity: 0, protected_free_quantity: 0 },
        },
      ]);
      expect(next_cursor).toBeNull();
      expect(new Date(rules_data_as_of).toISOString()).toBe(new Date(catalogFixtureSnapshotAt).toISOString());
      expect(rules_stale).toBe(false);
      expect(prices_observed_at).toBeNull();
      expect(prices_stale).toBe(true);
    });

    test('a row includes Oracle text when asked', async () => {
      const [fog] = (await page({ names: ['fog'], names_exclude: ['bank'], include_oracle_text: true })).items;

      expect(fog!.oracle_text).toBe('Prevent all combat damage that would be dealt this turn.');
    });

    test('zero results return an empty page and never relax a filter', async () => {
      expect(await page({ text: 'fog', types: ['planeswalker'] })).toMatchObject({ items: [], next_cursor: null });
    });
  });

  describe('chips', () => {
    test.each<[string, CatalogQuery, string[]]>([
      ['name, ignoring case', { names: ['FOG'] }, ['Fog', 'Fog Bank']],
      ['repeated name', { names: ['fog', 'bank'] }, ['Fog Bank']],
      ['negated name', { names: ['fog'], names_exclude: ['bank'] }, ['Fog']],
      ['name, ignoring accents', { names: ['nazgul'] }, ['Nazgûl Battle-Mace']],
      ['name, ignoring punctuation', { names: ['thassas oracle'] }, ["Thassa's Oracle"]],
      ['face name', { names: ['tok-tok'] }, ['Akki Lavarunner // Tok-Tok, Volcano Born']],
      ['full name of a card with faces', { names: ['fire//ice'] }, ['Fire // Ice']],
      ['name across a face boundary', { names: ['reic'] }, []],
      ['type', { types: ['wall'] }, ['Fog Bank', 'Wall of Forgotten Pharaohs']],
      [
        'repeated type',
        { types: ['legendary', 'planeswalker'] },
        ['Chandra, the Firebrand', 'Grist, the Hunger Tide', 'Sarkhan Vol', 'Teferi, Temporal Archmage'],
      ],
      ['negated type', { types: ['wall'], types_exclude: ['artifact'] }, ['Fog Bank']],
      [
        'types on different faces',
        { types: ['creature', 'sorcery'] },
        ['Adventurous Eater // Have a Bite', 'Bloomvine Regent // Claim Territory'],
      ],
      ['one type value across a face boundary', { types: ['warlock sorcery'] }, []],
      [
        'repeated color',
        { colors: ['W', 'U'] },
        [
          "Atraxa, Praetors' Voice",
          'Ayesha Tanaka, Armorer',
          'Inspirit, Flagship Vessel',
          'Lavinia, Foil to Conspiracy',
          'Search Warrant',
          'Shorikai, Genesis Engine',
          'Warrant // Warden',
        ],
      ],
      [
        'negated color',
        { colors: ['W', 'U'], colors_exclude: ['B'] },
        [
          'Ayesha Tanaka, Armorer',
          'Inspirit, Flagship Vessel',
          'Lavinia, Foil to Conspiracy',
          'Search Warrant',
          'Shorikai, Genesis Engine',
          'Warrant // Warden',
        ],
      ],
      [
        'colorless',
        { colors: ['C'], mana_value_max: 2 },
        [
          'Bladed Pinions',
          'Chronomaton',
          'Mister Gutsy',
          'Prism Ring',
          'Rix Maadi, Dungeon Palace',
          'Rockface Village',
          "Serra's Sanctum",
          'The Biblioplex',
          'Wall of Forgotten Pharaohs',
        ],
      ],
      ['negated colorless', { types: ['wall'], colors_exclude: ['C'] }, ['Fog Bank']],
      [
        'color identity fits a white-blue deck',
        { identity_subset_of: ['W', 'U'], mana_value_min: 5 },
        [
          'Ayesha Tanaka, Armorer',
          'Boon of the Spirit Realm',
          'Boreal Elemental',
          'Brisela, Voice of Nightmares',
          'Bruna, the Fading Light',
          'Buy Your Silence',
          'Conduit of Ruin',
          'Essence Fracture',
          'Everything Comes to Dust',
          'Matopi Golem',
          'Nazgûl Battle-Mace',
          'Ormos, Archive Keeper',
          'Pale Wayfarer',
          'Read the Tides',
          'Supplant Form',
          'Teferi, Temporal Archmage',
          'The Eternity Elevator',
          'Warrant // Warden',
          'Waterspout Elemental',
        ],
      ],
      [
        'colorless color identity',
        { identity_subset_of: [], types: ['creature'] },
        [
          'Chronomaton',
          'Conduit of Ruin',
          'Drill-Skimmer',
          'Matopi Golem',
          'Mister Gutsy',
          'Searchlight Companion',
          'Wall of Forgotten Pharaohs',
        ],
      ],
      [
        'power at least',
        { power_min: 6 },
        [
          'Brisela, Voice of Nightmares',
          'Copper Host Crusher',
          'Nessian Boar',
          'Ravenous Necrotitan',
          'Red Hulk',
          'Shorikai, Genesis Engine',
        ],
      ],
      [
        'power exactly',
        { power_min: 0, power_max: 0 },
        ['Fog Bank', 'Orcish Siegemaster', 'Spike Breeder', 'Wall of Forgotten Pharaohs'],
      ],
      [
        'power between a negative and a fractional bound',
        { power_min: -1, power_max: 0.5 },
        ['Fog Bank', 'Orcish Siegemaster', 'Spike Breeder', 'Wall of Forgotten Pharaohs'],
      ],
      [
        'toughness at least',
        { toughness_min: 7 },
        [
          'Brisela, Voice of Nightmares',
          'Bruna, the Fading Light',
          'Copper Host Crusher',
          'Red Hulk',
          'Shorikai, Genesis Engine',
        ],
      ],
      [
        'repeated keyword, ignoring case',
        { keywords: ['Flying', 'vigilance'] },
        ["Atraxa, Praetors' Voice", 'Brisela, Voice of Nightmares', 'Bruna, the Fading Light', 'Zephyrim'],
      ],
      ['negated keyword', { types: ['angel'], keywords_exclude: ['vigilance', 'lifelink'] }, ['Angelic Curator']],
      ['set', { sets: ['LEA'] }, ['Counterspell', 'Fog', 'Lightning Bolt', 'Llanowar Elves']],
      ['repeated set', { sets: ['lea', 'm12'] }, ['Llanowar Elves']],
      ['negated set', { names: ['fog'], sets_exclude: ['lea'] }, ['Fog Bank']],
      ['repeated rarity', { rarities: ['rare', 'uncommon'], types: ['legendary'] }, ['Dungeon Delver']],
      [
        'negated rarity',
        { types: ['angel'], rarities_exclude: ['mythic'] },
        ['Angelic Curator', 'Bruna, the Fading Light'],
      ],
      [
        'is commander',
        { is_commander: true, mana_value_min: 5 },
        [
          'Ayesha Tanaka, Armorer',
          'Brisela, Voice of Nightmares',
          'Bruna, the Fading Light',
          'Hidetsugu and Kairi',
          'Kenrith, the Returned King',
          'Kiki-Jiki, Mirror Breaker',
          'Ormos, Archive Keeper',
          'Ramses Overdark',
          'Red Hulk',
          'Teferi, Temporal Archmage',
          'Witch-king, Sky Scourge',
        ],
      ],
      [
        'is commander, including a legendary Vehicle and Spacecraft with power and toughness',
        { is_commander: true, types: ['artifact'] },
        ['Inspirit, Flagship Vessel', 'Shorikai, Genesis Engine'],
      ],
      [
        'is not commander',
        { is_commander: false, types: ['legendary'] },
        [
          'Agent of the Shadow Thieves',
          'Akki Lavarunner // Tok-Tok, Volcano Born',
          'Chandra, the Firebrand',
          'Dungeon Delver',
          'Grist, the Hunger Tide',
          'Matzalantli, the Great Door // The Core',
          'Sarkhan Vol',
          "Serra's Sanctum",
          'The Eternity Elevator',
        ],
      ],
      [
        'is Game Changer',
        { is_game_changer: true },
        ['Rhystic Study', "Serra's Sanctum", 'Smothering Tithe', "Thassa's Oracle"],
      ],
      [
        'is not Game Changer',
        { is_game_changer: false, types: ['enchantment'], identity_subset_of: ['U'], mana_value_min: 3 },
        ['Shimmer'],
      ],
    ])('%s', async (_, query, expected) => {
      expect(await names(query)).toEqual(expected);
    });

    test('a card with * power never matches a power bound', async () => {
      const results = await names({ power_min: 0, limit: 50, names: ['r'] });

      expect(results).not.toContain('Tarmogoyf');
      expect(results).not.toContain('Robobrain War Mind');
      expect(await names({ names: ['tarmogoyf'], power_max: 99 })).toEqual([]);
    });
  });

  describe('order', () => {
    const angels: CatalogQuery = { types: ['angel'] };

    test('a filter-only search lists cards from A to Z', async () => {
      expect(await names(angels)).toEqual([
        'Angelic Curator',
        "Atraxa, Praetors' Voice",
        'Brisela, Voice of Nightmares',
        'Bruna, the Fading Light',
        'Gisela, the Broken Blade',
      ]);
    });

    test.each<[CatalogQuery, string[]]>([
      [
        { sort: 'name', sort_order: 'desc' },
        ['Gisela, the Broken Blade', 'Bruna, the Fading Light', 'Brisela, Voice of Nightmares', "Atraxa, Praetors' Voice", 'Angelic Curator'],
      ],
      [
        { sort: 'mana_value' },
        ['Angelic Curator', "Atraxa, Praetors' Voice", 'Gisela, the Broken Blade', 'Bruna, the Fading Light', 'Brisela, Voice of Nightmares'],
      ],
      [
        { sort: 'mana_value', sort_order: 'desc' },
        ['Brisela, Voice of Nightmares', 'Bruna, the Fading Light', "Atraxa, Praetors' Voice", 'Gisela, the Broken Blade', 'Angelic Curator'],
      ],
      [
        { sort: 'edhrec_rank' },
        ["Atraxa, Praetors' Voice", 'Bruna, the Fading Light', 'Gisela, the Broken Blade', 'Angelic Curator', 'Brisela, Voice of Nightmares'],
      ],
      [
        { sort: 'edhrec_rank', sort_order: 'desc' },
        ['Angelic Curator', 'Gisela, the Broken Blade', 'Bruna, the Fading Light', "Atraxa, Praetors' Voice", 'Brisela, Voice of Nightmares'],
      ],
      [
        { sort: 'release_date' },
        ['Angelic Curator', 'Brisela, Voice of Nightmares', 'Bruna, the Fading Light', 'Gisela, the Broken Blade', "Atraxa, Praetors' Voice"],
      ],
      [
        { sort: 'release_date', sort_order: 'desc' },
        ["Atraxa, Praetors' Voice", 'Brisela, Voice of Nightmares', 'Bruna, the Fading Light', 'Gisela, the Broken Blade', 'Angelic Curator'],
      ],
    ])('sort %o', async (sort, expected) => {
      expect(await names({ ...angels, ...sort })).toEqual(expected);
    });

    test('relevance in ascending order reverses relevance order', async () => {
      const best = await names({ text: 'angel', limit: 50 });

      expect(await names({ text: 'angel', sort_order: 'asc', limit: 50 })).toEqual(best.toReversed());
    });
  });

  describe('paging', () => {
    const creatures = ["Adventurous Eater // Have a Bite", "Akki Lavarunner // Tok-Tok, Volcano Born", "Angelic Curator", "Atraxa, Praetors' Voice", "Ayesha Tanaka, Armorer", "Azra Oddsmaker", "Bladegraft Aspirant", "Bloomvine Regent // Claim Territory", "Bonecrusher Giant // Stomp", "Boreal Elemental", "Brambleguard Captain", "Brisela, Voice of Nightmares", "Bruna, the Fading Light", "Caldera Kavu", "Caustic Caterpillar", "Chaos Harlequin", "Chronomaton", "Conduit of Ruin", "Copper Host Crusher", "Cruel Sadist", "Dakmor Lancer", "Dauthi Ghoul", "Deathcap Marionette", "Delver of Secrets // Insectile Aberration", "Dissatisfied Customer", "Drill-Skimmer", "Dryad Arbor", "Emeritus of Truce // Swords to Plowshares", "Estwald Shieldbasher", "Favored of Iroas", "Field Marshal", "Fire Nation Salvagers", "Fog Bank", "Ghostflame Sliver", "Ghost Warden", "Gisela, the Broken Blade", "Glimmerbell", "Gloomwidow", "Goblin Instigator", "Hancock, Ghoulish Mayor", "Heirloom Auntie", "Hidetsugu and Kairi", "Hobblefiend", "Hollowhead Sliver", "Jinnie Fay, Jetmir's Second", "Kenrith, the Returned King", "Kiki-Jiki, Mirror Breaker", "Kjeldoran Home Guard", "Krenko, Mob Boss", "Lavinia, Foil to Conspiracy", "Leonin Lightscribe", "Lesser Werewolf", "Lifecreed Duo", "Llanowar Elves", "Lurking Chupacabra", "Matopi Golem", "Mesmeric Sliver", "Mischievous Mystic", "Mister Gutsy", "Nessian Boar", "Opal-Eye, Konda's Yojimbo", "Orcish Siegemaster", "Ormos, Archive Keeper", "Pale Wayfarer", "Peri Brown", "Phantasmal Mount", "Primaris Chaplain", "Rampant Elephant", "Ramses Overdark", "Ravenous Necrotitan", "Red Hulk", "Red Tiger Mechan", "Robobrain War Mind", "Roil Cartographer", "Sabertooth Nishoba", "Satoru, the Infiltrator", "Schema Thief", "Scoria Cat", "Scurrilous Sentry", "Searchlight Companion", "Selfless Police Captain", "Shackle Slinger", "Specter of Mortality", "Spike Breeder", "Spined Tyrranax", "Stormchaser Chimera", "Stronghold Rats", "Suspicious Shambler", "Tarmogoyf", "Thassa's Oracle", "Thundering Mightmare", "Thundering Wurm", "Urban Daggertooth", "Verdant Eidolon", "Vizier of Tumbling Sands", "Wall of Forgotten Pharaohs", "Waterspout Elemental", "Witch-king, Sky Scourge", "Zephyrim"];

    test.each([undefined, 50])('pages of %p cover every row once, in order', async (limit) => {
      const pages = await allPages({ types: ['creature'], limit });

      expect(pages.map((next) => next.items.length)).toEqual(limit === 50 ? [50, 49] : [20, 20, 20, 20, 19]);
      expect(pages.flatMap((next) => next.items.map((row) => row.name))).toEqual(creatures);
      expect(new Set(pages.map((next) => next.search_id)).size).toBe(1);
    });

    test('pages of a ranked text search follow the order of one large page', async () => {
      const onePage = await names({ text: 'flying', limit: 50 });
      const pages = await allPages({ text: 'flying', limit: 7 });

      expect(pages.flatMap((next) => next.items.map((row) => row.name))).toEqual(onePage);
    });

    test('a malformed cursor fails with invalid_cursor', async () => {
      const { error } = await search({ types: ['creature'], cursor: 'not a cursor' });

      expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
    });

    test('a cursor from another query fails with invalid_cursor', async () => {
      const { next_cursor } = await page({ types: ['creature'] });
      const { error } = await search({ types: ['creature'], colors: ['G'], cursor: next_cursor });

      expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
    });

    test('a cursor older than 15 minutes fails with invalid_cursor', async () => {
      const { next_cursor } = await page({ types: ['creature'] });
      const sixteenMinutesAgo = Date.now() / 1000 - 16 * 60;
      const { error } = await search({ types: ['creature'], cursor: withIssueTime(next_cursor!, sixteenMinutesAgo) });

      expect(error).toMatchObject({ code: 'invalid_cursor', field: 'cursor' });
    });
  });

  describe('input checks', () => {
    test.each<[string, Record<string, unknown>, string]>([
      ['unknown field', { text: 'fog', colour: ['W'] }, 'colour'],
      ['text of the wrong type', { text: 5 }, 'text'],
      ['empty text', { text: '' }, 'text'],
      ['text that is too long', { text: 'x'.repeat(201) }, 'text'],
      ['text with no letter or digit', { text: '!?' }, 'text'],
      ['empty list', { names: [] }, 'names'],
      ['list of the wrong type', { names: 'fog' }, 'names'],
      ['list that is too long', { names: 'abcdefghijk'.split('') }, 'names'],
      ['repeated list value', { names: ['fog', 'fog'] }, 'names[1]'],
      ['list value that is too long', { names: ['fog', 'x'.repeat(101)] }, 'names[1]'],
      ['list value of the wrong type', { types: ['wall', 3] }, 'types[1]'],
      ['unknown color', { colors: ['W', 'X'] }, 'colors[1]'],
      ['lowercase color', { colors: ['w'] }, 'colors[0]'],
      ['colorless in a color identity', { identity_subset_of: ['C'] }, 'identity_subset_of[0]'],
      ['fractional mana value', { mana_value_min: 1.5 }, 'mana_value_min'],
      ['negative mana value', { mana_value_min: -1 }, 'mana_value_min'],
      ['mana value above 20', { mana_value_max: 21 }, 'mana_value_max'],
      ['mana value minimum above its maximum', { mana_value_min: 5, mana_value_max: 3 }, 'mana_value_max'],
      ['power of the wrong type', { power_min: '3' }, 'power_min'],
      ['power minimum above its maximum', { power_min: 4, power_max: 2 }, 'power_max'],
      ['toughness out of range', { toughness_min: 100 }, 'toughness_min'],
      ['name value with no letter or digit', { names: ['//'] }, 'names[0]'],
      ['unknown keyword', { keywords: ['flying', 'teleport'] }, 'keywords[1]'],
      ['unknown set', { sets: ['lea', 'zzz'] }, 'sets[1]'],
      ['unknown rarity', { rarities: ['legendary'] }, 'rarities[0]'],
      ['boolean of the wrong type', { is_commander: 'yes' }, 'is_commander'],
      ['Oracle text flag of the wrong type', { text: 'fog', include_oracle_text: 1 }, 'include_oracle_text'],
      ['unknown sort', { names: ['fog'], sort: 'random' }, 'sort'],
      ['relevance without text', { names: ['fog'], sort: 'relevance' }, 'sort'],
      ['unknown sort order', { text: 'fog', sort_order: 'up' }, 'sort_order'],
      ['limit of 0', { text: 'fog', limit: 0 }, 'limit'],
      ['limit above 50', { text: 'fog', limit: 51 }, 'limit'],
      ['cursor of the wrong type', { text: 'fog', cursor: 5 }, 'cursor'],
      ['unknown tag', { text: 'fog', tags: ['ramp'] }, 'tags[0]'],
      ['unknown negated tag', { text: 'fog', tags_exclude: ['ramp'] }, 'tags_exclude[0]'],
      ['price as a number', { text: 'fog', price_max: 5 }, 'price_max'],
      ['price that is not a decimal amount', { text: 'fog', price_min: 'five' }, 'price_min'],
      ['price with more than 2 decimals', { text: 'fog', price_min: '1.234' }, 'price_min'],
      ['negative price', { text: 'fog', price_min: '-1' }, 'price_min'],
      ['price above 999999.99', { text: 'fog', price_max: '1000000' }, 'price_max'],
      ['price minimum above its maximum', { text: 'fog', price_min: '5', price_max: '4.99' }, 'price_max'],
      ['unknown price currency', { text: 'fog', price_currency: 'GBP' }, 'price_currency'],
    ])('%s is refused with an error on its field', async (_, query, field) => {
      const { page, error } = await search(query);

      expect(page).toBeNull();
      expect(error).toMatchObject({ code: 'invalid_argument', field });
      expect(error!.message).toContain(field.replace(/\[\d+\]$/, ''));
    });

    test.each<[string, Record<string, unknown> | unknown[]]>([
      ['an empty query', {}],
      ['a query with only paging and sort fields', { sort: 'name', limit: 5, include_oracle_text: true }],
      ['a query with only a price currency', { price_currency: 'EUR' }],
      ['a query that is not an object', ['fog']],
    ])('%s is refused', async (_, query) => {
      const { page, error } = await search(query);

      expect(page).toBeNull();
      expect(error).toMatchObject({ code: 'invalid_argument', field: null });
    });
  });

  describe('callers', () => {
    test('an anonymous caller is refused', async () => {
      const { data, error } = await anonymousClient().rpc('search_catalog', { query: { text: 'fog' } });

      expect(data).toBeNull();
      expect(error?.code).toBe(permissionDenied);
    });
  });

  describe('telemetry', () => {
    test('a first page writes one row with the API, caller, checked query, result count, latency, and first 20 IDs', async () => {
      const before = await telemetryRows();
      const first = await page({ types: ['creature'], limit: 30 });
      const rows = await telemetryRows();

      expect(rows).toHaveLength(before.length + 1);
      expect(rows.at(-1)).toMatchObject({
        search_id: first.search_id,
        user_id: alice.userId,
        api: 'catalog',
        caller: 'app',
        query: { types: ['creature'], sort: 'name', sort_order: 'asc', limit: 30, price_currency: 'USD' },
        result_count: 99,
        result_ids: first.items.slice(0, 20).map((row) => row.oracle_id),
      });
      expect(rows.at(-1)!.latency_ms).toBeGreaterThan(0);
    });

    test('a first page smaller than 20 still records the first 20 IDs', async () => {
      const small = await page({ types: ['creature'], limit: 5 });
      const large = await page({ types: ['creature'] });

      expect(small.items).toEqual(large.items.slice(0, 5));
      expect((await telemetryRows()).find((row) => row.search_id === small.search_id)!.result_ids).toEqual(
        large.items.map((row) => row.oracle_id),
      );
    });

    test('later pages and refused input write no row', async () => {
      const first = await page({ types: ['creature'] });
      const before = await telemetryRows();

      await page({ types: ['creature'], cursor: first.next_cursor });
      await search({ text: 'fog', limit: 0 });

      expect(await telemetryRows()).toHaveLength(before.length);
    });

    test('a zero-result search writes a row with no results', async () => {
      const { search_id } = await page({ names: ['zzzz'] });

      expect((await telemetryRows()).find((row) => row.search_id === search_id)).toMatchObject({
        result_count: 0,
        result_ids: [],
      });
    });

    test('app users cannot read telemetry', async () => {
      const { error } = await alice.client.from('search_telemetry').select('*');

      expect(error?.code).toBe(permissionDenied);
    });
  });

  describe('after a price import', () => {
    const basis = 'lowest current price over printings and finishes';
    const angels: CatalogQuery = { types: ['angel'] };

    beforeAll(async () => {
      expect((await runPriceImport(catalogFixtureManifest)).exitCode).toBe(0);
    });

    test('a row shows the lowest current price, labelled with its finish and currency', async () => {
      const [usd] = (await page({ names: ['hidetsugu'] })).items;
      const [eur] = (await page({ names: ['hidetsugu'], price_currency: 'EUR' })).items;

      expect(usd!.price_from).toEqual({ currency: 'USD', amount: '0.35', finish: 'foil', basis });
      expect(eur!.price_from).toEqual({ currency: 'EUR', amount: '0.15', finish: 'nonfoil', basis });
    });

    test('a card with no current price has no price_from', async () => {
      expect((await page({ names: ['brisela'] })).items[0]!.price_from).toBeNull();
    });

    test('a page carries the price observation time and is fresh', async () => {
      const { prices_observed_at, prices_stale } = await page({ names: ['fog'] });

      expect(prices_observed_at).not.toBeNull();
      expect(prices_stale).toBe(false);
    });

    test.each<[string, CatalogQuery, string[]]>([
      ['price at least', { price_min: '100' }, ["Serra's Sanctum"]],
      ['price at most', { price_max: '0.05', types: ['creature'] }, ['Favored of Iroas', 'Ghost Warden']],
      ['price between two bounds', { price_min: '10.00', price_max: '12.00' }, ['Shimmer']],
      [
        'price at least, with text',
        { text: 'creature', price_min: '20' },
        ["Atraxa, Praetors' Voice", 'Gisela, the Broken Blade', 'Ramses Overdark', "Thassa's Oracle"],
      ],
      [
        'price in EUR',
        { price_max: '0.05', price_currency: 'EUR', types: ['creature'] },
        [
          'Angelic Curator',
          'Drill-Skimmer',
          'Estwald Shieldbasher',
          'Favored of Iroas',
          'Ghost Warden',
          'Glimmerbell',
          'Gloomwidow',
          'Lurking Chupacabra',
          'Rampant Elephant',
          'Red Tiger Mechan',
          'Scurrilous Sentry',
          'Selfless Police Captain',
          'Stormchaser Chimera',
        ],
      ],
      ['a card with no price never matches a price bound', { names: ['brisela'], price_max: '999999.99' }, []],
    ])('%s', async (_, query, expected) => {
      const results = await names({ ...query, limit: 50 });

      expect(query.text ? results.toSorted() : results).toEqual(expected);
    });

    test.each<[CatalogQuery, string[]]>([
      [
        { sort: 'price' },
        ['Angelic Curator', 'Bruna, the Fading Light', 'Gisela, the Broken Blade', "Atraxa, Praetors' Voice", 'Brisela, Voice of Nightmares'],
      ],
      [
        { sort: 'price', sort_order: 'desc' },
        ["Atraxa, Praetors' Voice", 'Gisela, the Broken Blade', 'Bruna, the Fading Light', 'Angelic Curator', 'Brisela, Voice of Nightmares'],
      ],
      [
        { sort: 'price', price_currency: 'EUR' },
        ['Angelic Curator', 'Bruna, the Fading Light', 'Gisela, the Broken Blade', "Atraxa, Praetors' Voice", 'Brisela, Voice of Nightmares'],
      ],
    ])('sort %o puts missing prices last', async (sort, expected) => {
      expect(await names({ ...angels, ...sort })).toEqual(expected);
    });

    test('pages of a price sort cover every row once, in order', async () => {
      const query: CatalogQuery = { types: ['creature'], sort: 'price', sort_order: 'desc' };
      const onePage = await names({ ...query, limit: 50 });
      const pages = await allPages({ ...query, limit: 7 });

      expect(pages.flatMap((next) => next.items.map((row) => row.name)).slice(0, 50)).toEqual(onePage);
    });
  });
});

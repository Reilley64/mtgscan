import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import {
  readSearchError,
  type CatalogQuery,
  type CatalogRow,
  type OracleTagRow,
  type SearchPage,
  type TagLookupPage,
  type TagLookupQuery,
} from '../search';
import {
  catalogFixtureManifest,
  oracleTagOf,
  resetCardCatalog,
  runCatalogImport,
  runOracleTagImport,
} from './catalog-import-command';
import { anonymousClient, secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const importKeyClient = secretKeyClient();

let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  expect((await runOracleTagImport(catalogFixtureManifest)).exitCode).toBe(0);
});

afterEach(async () => {
  const { error } = await importKeyClient.from('disabled_tags').delete().not('tag_id', 'is', null);
  expect(error).toBeNull();
});

async function search(query: CatalogQuery | Record<string, unknown>) {
  const { data, error } = await alice.client.rpc('search_catalog', { query: query as Json });
  return { page: data as SearchPage<CatalogRow> | null, error: error && readSearchError(error) };
}

async function names(query: CatalogQuery) {
  const { page, error } = await search({ limit: 50, ...query });
  expect(error).toBeNull();
  return page!.items.map((row) => row.name);
}

async function lookUpTags(query: TagLookupQuery | Record<string, unknown> | unknown[], user: TestUser = alice) {
  const { data, error } = await user.client.rpc('search_oracle_tags', { query: query as Json });
  return { page: data as TagLookupPage | null, error: error && readSearchError(error) };
}

async function tagSlugs(query: TagLookupQuery) {
  const { page, error } = await lookUpTags(query);
  expect(error).toBeNull();
  return page!.items.map((row) => row.slug);
}

async function disable(slug: string) {
  const { error } = await importKeyClient.rpc('disable_oracle_tag', { tag_id: (await oracleTagOf(slug)).id });
  expect(error).toBeNull();
}

const removal = [
  'Bonecrusher Giant // Stomp',
  'Buy Your Silence',
  'Calamity of Cinders',
  'Caustic Caterpillar',
  'Chandra, the Firebrand',
  'Cruel Sadist',
  'Dakmor Lancer',
  'Deconstruction Hammer',
  'Eliminate the Competition',
  'Essence Fracture',
  'Everything Comes to Dust',
  'Fire // Ice',
  'Grist, the Hunger Tide',
  "It's Clobberin' Time!",
  'Lesser Werewolf',
  "Lich's Relic",
  'Lightning Bolt',
  'Lurking Chupacabra',
  'Nazgûl Battle-Mace',
  'Rampant Elephant',
  'Ramses Overdark',
  'Read the Tides',
  'Red Hulk',
  'Ribbons of Night',
  'Serene Heart',
  'Shock',
  'Sip of Hemlock',
  'Specter of Mortality',
  'Supplant Form',
  'Wall of Forgotten Pharaohs',
  'Waterspout Elemental',
];

const ramp = [
  'Beamtown Beatstick',
  'Bloomvine Regent // Claim Territory',
  'Buy Your Silence',
  'Fabrication Foundry',
  'Insidious Roots',
  'Lavinia, Foil to Conspiracy',
  'Llanowar Elves',
  "Serra's Sanctum",
  'Smothering Tithe',
  'Teferi, Temporal Archmage',
  'The Eternity Elevator',
  'Verdant Eidolon',
  'Vizier of Tumbling Sands',
];

const sweepers = [
  'Calamity of Cinders',
  'Everything Comes to Dust',
  'Serene Heart',
  'Specter of Mortality',
  'Waterspout Elemental',
];

describe('tag chip', () => {
  test('a tag with no direct taggings reaches every card tagged with a descendant tag', async () => {
    expect(await names({ tags: ['removal'] })).toEqual(removal);
  });

  test('a tag reaches only Commander-legal cards', async () => {
    const results = await names({ tags: ['ramp'] });

    expect(results).toEqual(ramp);
    expect(results).not.toContain('Black Lotus');
    expect(results).not.toContain('Primeval Titan');
  });

  test('a tag with several parents is reached through every parent path', async () => {
    expect(await names({ tags: ['removal-burn'] })).toContain('Calamity of Cinders');
    expect(await names({ tags: ['removal-creature'] })).toContain('Calamity of Cinders');
  });

  test('a repeated tag chip needs every tag', async () => {
    expect(await names({ tags: ['removal', 'sweeper-one-sided'] })).toEqual([
      'Calamity of Cinders',
      'Everything Comes to Dust',
    ]);
  });

  test('a negated tag chip leaves out the tag and its descendants', async () => {
    expect(await names({ tags: ['sweeper'], tags_exclude: ['sweeper-one-sided'] })).toEqual([
      'Serene Heart',
      'Specter of Mortality',
      'Waterspout Elemental',
    ]);
  });

  test('a tag slug ignores case', async () => {
    expect(await names({ tags: ['SWEEPER'] })).toEqual(sweepers);
  });
});

describe('text matches tag labels and aliases', () => {
  test('a tag label match ranks below name matches and above type line and Oracle text matches', async () => {
    const results = await names({ text: 'goblin' });

    expect(results[0]).toBe('Goblin Instigator');
    expect(results.slice(1, 3)).toEqual(['Krenko, Mob Boss', 'Orcish Siegemaster']);
    expect(results.slice(3, 6).sort()).toEqual(
      ['Akki Lavarunner // Tok-Tok, Volcano Born', 'Heirloom Auntie', 'Kiki-Jiki, Mirror Breaker'].sort(),
    );
  });

  test('a functional word reaches cards through the tag and its descendants', async () => {
    expect(await names({ text: 'ramp' })).toEqual(['Rampant Elephant', ...ramp]);
  });

  test('a tag alias matches, ignoring spaces and punctuation', async () => {
    expect(await names({ text: 'board wipe' })).toEqual(sweepers);
    expect(await names({ text: 'wipe' })).toEqual(sweepers);
  });
});

describe('a disabled tag', () => {
  test('is refused as a chip', async () => {
    await disable('sweeper');

    const { page, error } = await search({ tags: ['removal', 'sweeper'] });

    expect(page).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field: 'tags[1]' });
  });

  test('never matches text', async () => {
    await disable('sweeper');

    expect(await names({ text: 'board wipe' })).toEqual([]);
  });

  test('does not pass its closure through, and its children stay reachable through other parents', async () => {
    await disable('burn-creature');

    expect(await names({ tags: ['removal-burn'] })).toEqual([
      'Bonecrusher Giant // Stomp',
      'Chandra, the Firebrand',
      'Fire // Ice',
      'Lightning Bolt',
      'Red Hulk',
      'Shock',
      'Wall of Forgotten Pharaohs',
    ]);
    expect(await names({ tags: ['scales-with-power'] })).toContain("It's Clobberin' Time!");
    expect(await names({ tags: ['one-sided-fight'] })).toEqual(["It's Clobberin' Time!"]);
  });

  test('matches again once enabled', async () => {
    await disable('sweeper');
    const { error } = await importKeyClient.rpc('enable_oracle_tag', { tag_id: (await oracleTagOf('sweeper')).id });

    expect(error).toBeNull();
    expect(await names({ tags: ['sweeper'] })).toEqual(sweepers);
  });
});

describe('tag chip input checks', () => {
  test.each<[string, Record<string, unknown>, string]>([
    ['unknown tag slug', { tags: ['removal', 'board-wipes'] }, 'tags[1]'],
    ['unknown negated tag slug', { text: 'fog', tags_exclude: ['zzz'] }, 'tags_exclude[0]'],
    ['tag label instead of slug', { tags: ['combat ramp'] }, 'tags[0]'],
    ['empty tag list', { tags: [] }, 'tags'],
    ['repeated tag', { tags: ['ramp', 'RAMP'] }, 'tags[1]'],
  ])('%s is refused with an error on its field', async (_, query, field) => {
    const { page, error } = await search(query);

    expect(page).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
  });

  test('an unknown tag tells the caller to use the tag lookup', async () => {
    const { error } = await search({ tags: ['board-wipes'] });

    expect(error!.message).toContain('tag lookup');
  });
});

describe('tag lookup', () => {
  test('a row has the tag ID, slug, label, aliases, description, parent slugs, and Commander-legal card count', async () => {
    const { page, error } = await lookUpTags({ text: 'sweeper', limit: 1 });

    expect(error).toBeNull();
    expect(page!.items).toEqual([
      {
        id: (await oracleTagOf('sweeper')).id,
        slug: 'sweeper',
        label: 'sweeper',
        aliases: ['wipe', 'boardwipe', 'wrath of god', 'mass removal'],
        description: expect.stringContaining('Destroy all the things!'),
        parent_slugs: ['removal'],
        card_count: 5,
      } satisfies OracleTagRow,
    ]);
    expect(page!.rules_stale).toBe(false);
    expect(page!.rules_data_as_of).toEqual(expect.any(String));
  });

  test('an exact slug or label comes first, then related tags by the number of cards they reach, including tags outside its closure', async () => {
    expect(await tagSlugs({ text: 'sweeper' })).toEqual(['sweeper', 'sweeper-one-sided', 'sweeper-graveyard']);
  });

  test('an alias match comes before other text matches', async () => {
    expect((await tagSlugs({ text: 'board wipe' }))[0]).toBe('sweeper');
    expect((await tagSlugs({ text: 'acceleration' }))[0]).toBe('ramp');
  });

  test('a label with spaces finds its tag', async () => {
    expect((await tagSlugs({ text: 'multi land ramp' }))[0]).toBe('multi-land-ramp');
  });

  test('a tag with no direct taggings counts every Commander-legal card in its closure', async () => {
    const { page } = await lookUpTags({ text: 'removal', limit: 1 });

    expect(page!.items).toEqual([expect.objectContaining({ slug: 'removal', card_count: removal.length })]);
  });

  test('a disabled tag never appears', async () => {
    await disable('sweeper');

    expect(await tagSlugs({ text: 'sweeper' })).toEqual(['sweeper-one-sided', 'sweeper-graveyard']);
    const { page } = await lookUpTags({ text: 'sweeper-one-sided' });
    expect(page!.items[0]!.parent_slugs).toEqual([]);
  });

  test('the default limit is 10', async () => {
    expect(await tagSlugs({ text: 'removal' })).toHaveLength(10);
  });

  test('text with no match returns an empty list', async () => {
    expect(await tagSlugs({ text: 'zzzz' })).toEqual([]);
  });

  test.each<[string, Record<string, unknown>, string | null]>([
    ['missing text', { limit: 5 }, 'text'],
    ['empty text', { text: '' }, 'text'],
    ['text that is too long', { text: 'x'.repeat(101) }, 'text'],
    ['limit above 20', { text: 'ramp', limit: 21 }, 'limit'],
    ['limit of 0', { text: 'ramp', limit: 0 }, 'limit'],
    ['unknown field', { text: 'ramp', tags: ['ramp'] }, 'tags'],
  ])('%s is refused with an error on its field', async (_, query, field) => {
    const { page, error } = await lookUpTags(query);

    expect(page).toBeNull();
    expect(error).toMatchObject({ code: 'invalid_argument', field });
  });

  test('a query that is not an object is refused', async () => {
    const { error } = await lookUpTags(['ramp']);

    expect(error).toMatchObject({ code: 'invalid_argument', field: null });
  });

  test('an anonymous caller is refused', async () => {
    const { data, error } = await anonymousClient().rpc('search_oracle_tags', { query: { text: 'ramp' } });

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });
});

describe('before the first catalog import', () => {
  beforeAll(resetCardCatalog);

  test('tag lookup returns data_unavailable', async () => {
    const { page, error } = await lookUpTags({ text: 'ramp' });

    expect(page).toBeNull();
    expect(error?.code).toBe('data_unavailable');
  });
});

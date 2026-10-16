import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { CollectionCopyRow, UserTagList } from '../collection';
import type { AddDeckCardPreview, Deck, DeckChangeEffect, DeckChangePage, DeckList, RevertPreview } from '../decks';
import type { SearchPage } from '../search';
import { testUser } from '../test-user/account';
import {
  catalogFixtureManifest,
  resetCardCatalog,
  runCatalogImport,
  runComboImport,
  runOracleTagImport,
  runTestUserCommand,
  spellbookFixtureVariants,
} from './catalog-import-command';
import { anonymousClient, secretKeyClient, type AppClient } from './local-stack';

setDefaultTimeout(60_000);

const hostedPassword = 'hosted-test-user-password';

async function signedInTestUser(password = testUser.password): Promise<AppClient> {
  const client = anonymousClient();
  const { error } = await client.auth.signInWithPassword({ email: testUser.email, password });
  expect(error).toBeNull();
  return client;
}

async function ownedCopies(client: AppClient) {
  const { data, error } = await client.rpc('search_collection', { query: { rows: 'copies', limit: 120 } });
  expect(error).toBeNull();
  return (data as unknown as SearchPage<CollectionCopyRow>).items;
}

async function collectionEntries(client: AppClient) {
  const { data, error } = await client.from('copies').select('card_printing_id, finish, condition, language, is_protected');
  expect(error).toBeNull();
  return [...new Map(data!.map((copy) => [JSON.stringify(copy), copy])).values()];
}

async function additions(client: AppClient) {
  const { data, error } = await client.from('collection_additions').select('copy_count, source');
  expect(error).toBeNull();
  return data!;
}

async function userTags(client: AppClient) {
  const { data, error } = await client.rpc('list_user_tags');
  expect(error).toBeNull();
  return (data as unknown as UserTagList).items;
}

async function decks(client: AppClient) {
  const { data, error } = await client.rpc('list_decks');
  expect(error).toBeNull();
  return (data as unknown as DeckList).items;
}

async function deckOf(client: AppClient, deckId: string) {
  const { data, error } = await client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return data as unknown as Deck;
}

async function deckChangesOf(client: AppClient, deckId: string) {
  const { data, error } = await client.rpc('list_deck_changes', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return (data as unknown as DeckChangePage).items;
}

describe('the test user command', () => {
  beforeAll(async () => {
    await resetCardCatalog();
  });

  test.each(['https://abcdefghijklmnop.supabase.co', 'http://127.0.0.1.example.com:54321', 'https://localhost:54321'])(
    'refuses Supabase at %p, which is not the local stack',
    async (url) => {
      const { exitCode, output } = await runTestUserCommand(['--sample-collection'], { SUPABASE_URL: url });

      expect(exitCode).toBe(2);
      expect(output).toContain('The test user is only for local Supabase.');
    },
  );

  test('with an empty card catalog, --sample-collection says to import the card catalog first', async () => {
    const { exitCode, output } = await runTestUserCommand(['--sample-collection']);

    expect(exitCode).toBe(1);
    expect(output).toContain('The card catalog is empty.');
  });

  test('the test user signs in with the local default password and has an empty collection', async () => {
    const { exitCode, output } = await runTestUserCommand([]);

    expect(exitCode).toBe(0);
    expect(output).toContain(`The test user ${testUser.email} is ready.`);
    expect(await collectionEntries(await signedInTestUser())).toEqual([]);
  });

  test('--sample-collection adds sample collection entries to the test user through add_scan_batch', async () => {
    expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);

    const { exitCode, output } = await runTestUserCommand(['--sample-collection']);

    expect(exitCode).toBe(0);
    expect(output).toContain('Added 30 sample collection entries.');
    const client = await signedInTestUser();
    const entries = await collectionEntries(client);
    expect(entries).toHaveLength(30);
    expect(entries.some((entry) => entry.finish === 'foil')).toBe(true);
    expect(entries.some((entry) => entry.finish === 'etched')).toBe(true);
    expect(entries.some((entry) => entry.condition !== 'near_mint')).toBe(true);
    expect((await ownedCopies(client)).filter((copy) => copy.protected)).toHaveLength(1);
    expect(await additions(client)).toEqual([{ copy_count: (await ownedCopies(client)).length, source: 'scan_batch' }]);
    expect(output).toContain('Added 2 sample user tags.');
    expect(await userTags(client)).toEqual([
      { user_tag_id: expect.any(String), name: 'Signed', copy_count: 1 },
      { user_tag_id: expect.any(String), name: 'Trade binder', copy_count: 3 },
    ]);
  });

  test('--sample-collection adds a sample deck with two commanders that pair, twelve main deck cards, basic lands, and a reverted deck change', async () => {
    const { exitCode, output } = await runTestUserCommand(['--sample-collection']);

    expect(exitCode).toBe(0);
    expect(output).toContain('Added a sample deck with 2 commanders, 12 main deck cards, 16 basic lands, and 19 deck changes.');
    const client = await signedInTestUser();
    const [row, ...otherDecks] = await decks(client);
    expect(otherDecks).toEqual([]);
    expect(row!.card_count).toBe(30);
    const deck = await deckOf(client, row!.deck_id);
    expect(deck.name).toBe('Tymna the Weaver');
    expect(row!.commanders.map((commander) => commander.name)).toEqual(['Tymna the Weaver', 'Thrasios, Triton Hero']);
    expect(deck.cards.filter((card) => card.role === 'main')).toHaveLength(12);
    expect(deck.cards.some((card) => card.protected)).toBe(false);
    expect(deck.basic_lands.filter((land) => land.count > 0).map(({ name, count }) => ({ name, count }))).toEqual([
      { name: 'Island', count: 6 },
      { name: 'Forest', count: 8 },
      { name: 'Snow-Covered Forest', count: 2 },
    ]);
    expect((await deckChangesOf(client, deck.deck_id)).map(({ kind, reverted }) => ({ kind, reverted }))).toEqual([
      { kind: 'revert', reverted: false },
      { kind: 'added', reverted: true },
      { kind: 'basic_lands', reverted: false },
      { kind: 'made_partner', reverted: false },
      { kind: 'made_commander', reverted: false },
      ...Array.from({ length: 14 }, () => ({ kind: 'added' as const, reverted: false })),
    ]);
  });

  test('the sample deck is invalid by every rule except the commander rules, and has bracket signals up to bracket 4', async () => {
    expect((await runOracleTagImport(catalogFixtureManifest)).exitCode).toBe(0);
    expect((await runComboImport(spellbookFixtureVariants)).exitCode).toBe(0);

    expect((await runTestUserCommand(['--sample-collection'])).output).toContain(
      'The sample deck is invalid, with estimated bracket 4.',
    );

    const client = await signedInTestUser();
    const [row] = await decks(client);
    expect(row!.evaluation).toMatchObject({ validity: 'invalid', estimated_bracket: 4 });
    const { evaluation } = await deckOf(client, row!.deck_id);
    expect(evaluation!.undetermined).toEqual([]);
    expect(evaluation!.violations.map(({ rule, message, hint }) => ({ rule, message, hint }))).toEqual([
      { rule: 'deck_size', message: '30 of 100 cards.', hint: 'Add 70 cards.' },
      { rule: 'singleton', message: '2 copies of Counterspell.', hint: 'Remove 1 Counterspell.' },
      { rule: 'color_identity', message: '1 card is outside Green, White, Blue, and Black.', hint: null },
      { rule: 'banned', message: 'Black Lotus is banned in Commander.', hint: null },
      { rule: 'not_legal', message: 'Once More with Feeling is not legal in Commander.', hint: null },
    ]);
    expect(
      evaluation!.bracket_signals.map(({ kind, count, lowest_bracket, cards }) => ({
        kind,
        count,
        lowest_bracket,
        cards: cards.map((card) => card.name).sort(),
      })),
    ).toEqual([
      { kind: 'game_changers', count: 3, lowest_bracket: 3, cards: ['Rhystic Study', 'Smothering Tithe', "Thassa's Oracle"] },
      { kind: 'mass_land_denial', count: 1, lowest_bracket: 4, cards: ['Once More with Feeling'] },
      { kind: 'two_card_combo', count: 1, lowest_bracket: 4, cards: ['Demonic Consultation', "Thassa's Oracle"] },
      { kind: 'extra_turns', count: 2, lowest_bracket: 2, cards: ['Temporal Manipulation', 'Time Warp'] },
    ]);
    expect(evaluation!.missing_signal_count).toBe(1);
  });

  test('adding the free copy of Lightning Bolt to the sample deck, or reverting its revert, adds a singleton and a color identity violation', async () => {
    expect((await runTestUserCommand(['--sample-collection'])).exitCode).toBe(0);

    const client = await signedInTestUser();
    const [row] = await decks(client);
    const freeBolt = (await ownedCopies(client)).find((copy) => copy.name === 'Lightning Bolt' && !copy.deck)!;
    const addsViolation: DeckChangeEffect = {
      kind: 'adds_violation',
      rules: [{ rule: 'singleton' }, { rule: 'color_identity', colors: ['R'] }],
    };

    const { data: addPreview, error: addError } = await client.rpc('preview_add_deck_card', {
      query: { copy_id: freeBolt.copy_id },
    });
    const [revert] = await deckChangesOf(client, row!.deck_id);
    const { data: revertPreview, error: revertError } = await client.rpc('preview_revert', {
      query: { deck_id: row!.deck_id, deck_change_id: revert!.deck_change_id },
    });

    expect(addError).toBeNull();
    expect((addPreview as unknown as AddDeckCardPreview).items).toEqual([{ deck_id: row!.deck_id, effect: addsViolation }]);
    expect(revertError).toBeNull();
    expect((revertPreview as unknown as RevertPreview).effect).toEqual(addsViolation);
  });

  test('running the command again resets the test user to an empty collection', async () => {
    expect((await runTestUserCommand(['--sample-collection'])).exitCode).toBe(0);

    expect((await runTestUserCommand([])).exitCode).toBe(0);

    const client = await signedInTestUser();
    expect(await ownedCopies(client)).toEqual([]);
    expect(await additions(client)).toEqual([]);
    expect(await userTags(client)).toEqual([]);
    expect(await decks(client)).toEqual([]);
  });

  test('the command also resets a test user whose password was changed', async () => {
    const client = await signedInTestUser();
    const { data } = await client.auth.getUser();
    const { error } = await secretKeyClient().auth.admin.updateUserById(data.user!.id, { password: crypto.randomUUID() });
    expect(error).toBeNull();

    expect((await runTestUserCommand([])).exitCode).toBe(0);

    await signedInTestUser();
  });

  test.each([
    ['a missing password', {}],
    ['an empty password', { EXPO_PUBLIC_TEST_USER_PASSWORD: '' }],
    ['the local default password', { EXPO_PUBLIC_TEST_USER_PASSWORD: testUser.password }],
  ])('with --hosted, refuses %s', async (_, env) => {
    const { exitCode, output } = await runTestUserCommand(['--hosted', '--sample-collection'], env);

    expect(exitCode).toBe(2);
    expect(output).toContain('Set EXPO_PUBLIC_TEST_USER_PASSWORD to the hosted test user password');
  });

  test('with --hosted, the test user signs in with the password from the environment and has the sample collection', async () => {
    const { exitCode, output } = await runTestUserCommand(['--hosted', '--sample-collection'], {
      EXPO_PUBLIC_TEST_USER_PASSWORD: hostedPassword,
    });

    expect(exitCode).toBe(0);
    expect(output).toContain(`The test user ${testUser.email} is ready.`);
    expect(output).toContain('Added 30 sample collection entries.');
    expect(await collectionEntries(await signedInTestUser(hostedPassword))).toHaveLength(30);
    const { error } = await anonymousClient().auth.signInWithPassword(testUser);
    expect(error?.code).toBe('invalid_credentials');
  });

  test('with --hosted, running the command again resets the test user to the sample collection', async () => {
    const env = { EXPO_PUBLIC_TEST_USER_PASSWORD: hostedPassword };
    expect((await runTestUserCommand(['--hosted', '--sample-collection'], env)).exitCode).toBe(0);

    expect((await runTestUserCommand(['--hosted', '--sample-collection'], env)).exitCode).toBe(0);

    const client = await signedInTestUser(hostedPassword);
    expect(await collectionEntries(client)).toHaveLength(30);
    expect(await additions(client)).toHaveLength(1);
  });
});

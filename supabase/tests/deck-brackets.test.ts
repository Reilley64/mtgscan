import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import {
  readDeckError,
  type BracketSignal,
  type CreatedDeck,
  type Deck,
  type DeckList,
  type EstimatedBracket,
} from '../decks';
import {
  catalogFixture,
  catalogFixtureManifest,
  catalogFixtureSnapshotAt,
  oracleIdOf,
  oracleTagFixtureSnapshotAt,
  oracleTagOf,
  resetCardCatalog,
  runCatalogImport,
  runComboImport,
  runOracleTagCommand,
  runOracleTagImport,
  spellbookFixtureSnapshotAt,
  spellbookFixtureVariants,
} from './catalog-import-command';
import { secretKeyClient, signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const laterOracleTagSnapshotAt = '2026-10-20T09:00:00.000+00:00';
const gameChangers = ['Rhystic Study', "Serra's Sanctum", 'Smothering Tithe', "Thassa's Oracle"];
const extraTurnCards = ['Capture of Jingzhou', 'Temporal Manipulation', 'Time Warp', 'Walk the Aeons'];
const plainCard = 'Llanowar Elves';

let user: TestUser;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  user = await signUpNewUser();
});

async function printingIdOf(name: string) {
  const { data, error } = await secretKeyClient()
    .from('card_printings')
    .select('id')
    .eq('oracle_id', await oracleIdOf(name))
    .contains('finishes', ['nonfoil'])
    .order('id')
    .limit(1)
    .single();
  expect(error).toBeNull();
  return data!.id;
}

async function deckWith(names: string[]) {
  const { data, error } = await user.client.rpc('create_deck', { request: { name: 'Bracket' } });
  expect(error).toBeNull();
  const deckId = (data as unknown as CreatedDeck).deck_id;
  const stacks = await Promise.all(names.map(async (name) => stack(await printingIdOf(name))));
  await committed(user, scanBatch(stacks));
  for (const scanned of stacks) {
    const request = { deck_id: deckId, copy_id: scanned.copy_ids[0]!, unprotect: false };
    const { error: addError } = await user.client.rpc('add_deck_card', { request: request as Json });
    expect(addError && readDeckError(addError)).toBeNull();
  }
  return deckId;
}

async function evaluationOf(deckId: string) {
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return (data as unknown as Deck).evaluation!;
}

async function evaluationWith(names: string[]) {
  return evaluationOf(await deckWith(names));
}

function signalOf(signals: BracketSignal[], kind: BracketSignal['kind']) {
  return signals.find((signal) => signal.kind === kind);
}

function cardNames(signal: BracketSignal | undefined) {
  return signal?.cards.map((card) => card.name);
}

describe('before any Oracle tag or combo import', () => {
  test('a deck evaluation has no Oracle tag or combo data, and the bracket rules data time is the card catalog time', async () => {
    const deckId = await deckWith([plainCard]);

    expect(await evaluationOf(deckId)).toMatchObject({
      estimated_bracket: 2,
      catalog_at: catalogFixtureSnapshotAt,
      oracle_tags_at: null,
      commander_spellbook_at: null,
      bracket_rules_data_at: catalogFixtureSnapshotAt,
      no_oracle_tag_data: true,
      no_combo_data: true,
    });
  });
});

describe('estimated bracket', () => {
  beforeAll(async () => {
    expect((await runOracleTagImport(catalogFixtureManifest)).exitCode).toBe(0);
    expect((await runComboImport(spellbookFixtureVariants)).exitCode).toBe(0);
  });

  test('a deck with no bracket signal is bracket 2 and still shows Game Changers with a count of 0', async () => {
    const evaluation = await evaluationWith([plainCard]);

    expect(evaluation.estimated_bracket).toBe(2);
    expect(evaluation.bracket_signals).toEqual([
      { kind: 'game_changers', source: 'official', count: 0, lowest_bracket: 2, cards: [] },
    ]);
    expect(evaluation.missing_signal_count).toBe(0);
  });

  test.each<[number, EstimatedBracket]>([
    [1, 3],
    [3, 3],
    [4, 4],
  ])('%i Game Changers set bracket %i', async (count, bracket) => {
    const evaluation = await evaluationWith([plainCard, ...gameChangers.slice(0, count)]);

    expect(evaluation.estimated_bracket).toBe(bracket);
    const signal = signalOf(evaluation.bracket_signals, 'game_changers');
    expect(signal).toMatchObject({ source: 'official', count, lowest_bracket: bracket });
    expect(cardNames(signal)).toEqual(gameChangers.slice(0, count));
  });

  test('a bracket signal lists each copy as a deck evaluation card', async () => {
    const deckId = await deckWith(['Rhystic Study']);
    const { data } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
    const copyId = (data as unknown as Deck).cards[0]!.copy_id;

    expect(signalOf((await evaluationOf(deckId)).bracket_signals, 'game_changers')!.cards).toEqual([
      { kind: 'copy', copy_id: copyId, name: 'Rhystic Study', image_uris: expect.arrayContaining([expect.any(String)]) },
    ]);
  });

  test('a card with no Game Changer flag is not counted and adds to the missing signal count', async () => {
    const evaluation = await evaluationWith(['Mind Stone', 'Rhystic Study']);

    expect(evaluation.missing_signal_count).toBe(1);
    expect(signalOf(evaluation.bracket_signals, 'game_changers')).toMatchObject({ count: 1, lowest_bracket: 3 });
  });

  test('a card tagged mass land denial sets bracket 4', async () => {
    const evaluation = await evaluationWith([plainCard, 'Once More with Feeling']);

    expect(evaluation.estimated_bracket).toBe(4);
    expect(signalOf(evaluation.bracket_signals, 'mass_land_denial')).toMatchObject({
      source: 'heuristic',
      count: 1,
      lowest_bracket: 4,
      cards: [{ name: 'Once More with Feeling' }],
    });
  });

  test.each<[number, EstimatedBracket]>([
    [1, 2],
    [3, 2],
    [4, 4],
  ])('%i extra-turn cards set bracket %i', async (count, bracket) => {
    const evaluation = await evaluationWith(extraTurnCards.slice(0, count));

    expect(evaluation.estimated_bracket).toBe(bracket);
    const signal = signalOf(evaluation.bracket_signals, 'extra_turns');
    expect(signal).toMatchObject({ source: 'heuristic', count, lowest_bracket: bracket });
    expect(cardNames(signal)).toEqual(extraTurnCards.slice(0, count));
  });

  test('a signal with a count of 0 is left out, except Game Changers', async () => {
    const evaluation = await evaluationWith([plainCard, 'Demonic Consultation']);

    expect(evaluation.bracket_signals.map((signal) => signal.kind)).toEqual(['game_changers']);
  });

  test.each<[string, EstimatedBracket, string[]]>([
    ['ruthless', 4, ['Demonic Consultation', "Thassa's Oracle"]],
    ['spicy', 3, ['Intruder Alarm', 'Shorikai, Genesis Engine']],
    ['powerful', 3, ['Leveler', "Thassa's Oracle"]],
  ])('a two-card combo tagged %s sets bracket %i', async (bracketTag, bracket, names) => {
    const signal = signalOf((await evaluationWith(names)).bracket_signals, 'two_card_combo');

    expect(signal).toMatchObject({ source: 'heuristic', count: 1, lowest_bracket: bracket, combos: [{ bracket_tag: bracketTag }] });
    expect(cardNames(signal)).toEqual(names);
  });

  test.each<[string, string[]]>([
    ['oddball', ['Urban Daggertooth', 'Walking Ballista']],
    ['core', ['Blasphemous Act', 'Repercussion']],
    ['exhibition', ['Kiki-Jiki, Mirror Breaker', 'Teardrop Kami']],
    ['banned', ['Auriok Salvagers', 'Black Lotus']],
  ])('a two-card combo tagged %s gives no bracket signal', async (_, names) => {
    expect(signalOf((await evaluationWith(names)).bracket_signals, 'two_card_combo')).toBeUndefined();
  });

  test('the combo signal lists each combo with its two cards, its produced features, and its bracket tag', async () => {
    const evaluation = await evaluationWith(['Demonic Consultation', 'Leveler', "Thassa's Oracle"]);

    expect(evaluation.estimated_bracket).toBe(4);
    const signal = signalOf(evaluation.bracket_signals, 'two_card_combo');
    expect(signal).toMatchObject({ count: 2, lowest_bracket: 4 });
    expect(cardNames(signal)).toEqual(['Demonic Consultation', 'Leveler', "Thassa's Oracle"]);
    expect(
      signal?.kind === 'two_card_combo' &&
        signal.combos.map((combo) => ({ ...combo, cards: combo.cards.map((card) => card.name) })),
    ).toEqual([
      {
        cards: ['Demonic Consultation', "Thassa's Oracle"],
        produced_features: ['Exile your library', 'Win the game'],
        bracket_tag: 'ruthless',
      },
      { cards: ['Leveler', "Thassa's Oracle"], produced_features: ['Exile your library', 'Win the game'], bracket_tag: 'powerful' },
    ]);
  });

  test('the highest lowest bracket of all signals is the estimated bracket', async () => {
    const evaluation = await evaluationWith(['Rhystic Study', 'Time Warp', 'Once More with Feeling']);

    expect(evaluation.bracket_signals.map((signal) => [signal.kind, signal.lowest_bracket])).toEqual([
      ['game_changers', 3],
      ['mass_land_denial', 4],
      ['extra_turns', 2],
    ]);
    expect(evaluation.estimated_bracket).toBe(4);
  });

  test('the deck evaluation stores each snapshot time, and the bracket rules data time is the oldest', async () => {
    const deckId = await deckWith([plainCard]);

    expect(await evaluationOf(deckId)).toMatchObject({
      catalog_at: catalogFixtureSnapshotAt,
      oracle_tags_at: oracleTagFixtureSnapshotAt,
      commander_spellbook_at: spellbookFixtureSnapshotAt,
      bracket_rules_data_at: catalogFixtureSnapshotAt,
      no_oracle_tag_data: false,
      no_combo_data: false,
    });
    const { data } = await user.client.rpc('list_decks');
    expect((data as unknown as DeckList).items.find((item) => item.deck_id === deckId)!.evaluation).toEqual({
      validity: 'invalid',
      validity_stale: false,
      estimated_bracket: 2,
      bracket_stale: false,
    });
  });

  test('a disabled tag never counts', async () => {
    const tagId = (await oracleTagOf('extra-turn')).id;
    expect((await runOracleTagCommand('disable', tagId)).exitCode).toBe(0);
    try {
      expect(signalOf((await evaluationWith(extraTurnCards)).bracket_signals, 'extra_turns')).toBeUndefined();
    } finally {
      expect((await runOracleTagCommand('enable', tagId)).exitCode).toBe(0);
    }
  });

  test('a card tagged with a descendant tag counts for its signal', async () => {
    const massLandDenial = await oracleTagOf('mass-land-denial');
    const manifest = await catalogFixture({
      updatedAt: laterOracleTagSnapshotAt,
      oracleTags: (records) =>
        records.map((tag) => (tag.slug === 'anthem' ? { ...tag, parent_ids: [massLandDenial.id] } : tag)),
    });
    expect((await runOracleTagImport(manifest)).exitCode).toBe(0);

    const signal = signalOf((await evaluationWith(['Field Marshal'])).bracket_signals, 'mass_land_denial');

    expect(cardNames(signal)).toEqual(['Field Marshal']);
  });
});

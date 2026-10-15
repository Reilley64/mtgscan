import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import type { CreatedDeck, Deck, DeckEvaluationCard, UndeterminedCheck, Violation } from '../decks';
import {
  basicLand,
  catalogFixture,
  catalogFixtureManifest,
  resetCardCatalog,
  runCatalogImport,
  withoutCards,
} from './catalog-import-command';
import { signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const printings = {
  'Krenko, Mob Boss': 'aa078518-0ce2-4c6f-9061-aa7e22ed7493',
  'Shorikai, Genesis Engine': '0347cf84-42f5-4674-99de-619b0ae51d62',
  'Inspirit, Flagship Vessel': '46900ec7-eb18-45c4-8e90-a48b665cfdee',
  'Teferi, Temporal Archmage': '80eec0bd-9eb4-4360-b97b-9c7985a63343',
  'Lightning Bolt': '132dc07f-74e2-4bd7-bdb1-4f5d5253c7f2',
  'The Eternity Elevator': '1bb90ab9-43b9-4991-806a-0afc4d8caf5f',
  'Dungeon Delver': '86142f1e-dd75-4c46-a58d-9386b69a9a1f',
  'Wilson, Refined Grizzly': 'dfe0daf8-43da-484b-baa1-76f8313c5a0c',
  'Tymna the Weaver': 'bc7cbe9b-324e-42b8-94e2-36e91cb32163',
  'Thrasios, Triton Hero': '21e27b91-c7f1-4709-aa0d-8b5d81b22a0a',
  'Sophina, Spearsage Deserter': 'e0a64924-068e-483f-91a6-d450b67b3c75',
  'Othelm, Sigardian Outcast': 'b867fb22-4f2a-47aa-9432-1bcc5e731947',
  'Ellie, Brick Master': 'e973462f-589d-4c53-81d7-075ec1d5a9b4',
  'Amy Pond': 'e50a2faa-91e3-4e89-ba8d-2cbf7ac005c0',
  'Rory Williams': 'f51a010d-641c-413f-8f91-0c8ff3b2085c',
  'Clara Oswald': '9a1ee042-6713-4e9e-9901-9b94d99d33f1',
  'Peri Brown': 'b2f81beb-4565-4cfe-80a2-456f3d44f461',
  'The Tenth Doctor': 'f1499f49-793b-4265-9ad0-883a431941ab',
};

type CardName = keyof typeof printings;

const foilOnly = new Set<CardName>(['Tymna the Weaver', 'Thrasios, Triton Hero', 'The Tenth Doctor']);

const wastes = basicLand('Wastes').oracle_id;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function rpc(user: TestUser, name: string, request: Record<string, unknown>) {
  const { data, error } = await user.client.rpc(name as 'create_deck', { request: request as Json });
  expect(error).toBeNull();
  return data;
}

type DeckCopy = { name: CardName; copyId: string };

async function scannedCopy(user: TestUser, name: CardName): Promise<DeckCopy> {
  const scanned = stack(printings[name], { finish: foilOnly.has(name) ? 'foil' : 'nonfoil' });
  await committed(user, scanBatch([scanned]));
  return { name, copyId: scanned.copy_ids[0]! };
}

function expectedCard({ name, copyId }: DeckCopy): DeckEvaluationCard {
  return { kind: 'copy', copy_id: copyId, name, image_uris: [expect.any(String)] as unknown as string[] };
}

async function deckWith(user: TestUser, commanders: DeckCopy[], mainDeck: DeckCopy[] = []) {
  const { deck_id: deckId } = (await rpc(user, 'create_deck', { name: 'Commanders' })) as unknown as CreatedDeck;
  for (const { copyId } of [...commanders, ...mainDeck]) {
    await rpc(user, 'add_deck_card', { deck_id: deckId, copy_id: copyId, unprotect: false });
  }
  for (const { copyId } of commanders) {
    await rpc(user, 'set_deck_commander', { copy_id: copyId, commander: true });
  }
  const basicLandCount = 100 - commanders.length - mainDeck.length;
  await rpc(user, 'set_basic_lands', { deck_id: deckId, counts: [{ oracle_id: wastes, count: basicLandCount }] });
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  const cards = Object.fromEntries([...commanders, ...mainDeck].map((copy) => [copy.name, expectedCard(copy)]));
  return { evaluation: (data as unknown as Deck).evaluation!, cards };
}

async function deckWithCommanders(user: TestUser, names: CardName[]) {
  const commanders = [];
  for (const name of names) {
    commanders.push(await scannedCopy(user, name));
  }
  return deckWith(user, commanders);
}

function commanderEligibility(message: string, cards: DeckEvaluationCard[]): Violation {
  return { rule: 'commander_eligibility', citation: 'CR 903.3', message, hint: null, cards };
}

function commanderChecks(undetermined: UndeterminedCheck[]) {
  return undetermined.filter((check) => check.rule === 'commander_eligibility' || check.rule === 'partner');
}

function partner(message: string, cards: DeckEvaluationCard[]): Violation {
  return { rule: 'partner', citation: 'CR 702.124', message, hint: null, cards };
}

describe('commander eligibility', () => {
  test.each<[string, CardName]>([
    ['a legendary creature', 'Krenko, Mob Boss'],
    ['a legendary Vehicle with power and toughness', 'Shorikai, Genesis Engine'],
    ['a legendary Spacecraft with power and toughness', 'Inspirit, Flagship Vessel'],
    ['a card that says it can be your commander', 'Teferi, Temporal Archmage'],
  ])('%s can be your commander', async (_, name) => {
    const user = await signUpNewUser();

    const { evaluation } = await deckWithCommanders(user, [name]);

    expect(evaluation).toMatchObject({ validity: 'valid', violations: [], undetermined: [] });
  });

  test.each<[string, CardName]>([
    ['an instant', 'Lightning Bolt'],
    ['a legendary Spacecraft with no power and toughness', 'The Eternity Elevator'],
    ['a Background on its own', 'Dungeon Delver'],
  ])('%s cannot be your commander, and the violation names it', async (_, name) => {
    const user = await signUpNewUser();

    const { evaluation, cards } = await deckWithCommanders(user, [name]);

    expect(evaluation).toMatchObject({
      validity: 'invalid',
      violations: [commanderEligibility(`${name} cannot be your commander.`, [cards[name]!])],
      undetermined: [],
    });
  });

  test('a violation names each commander that cannot be a commander, one sentence each', async () => {
    const user = await signUpNewUser();

    const { evaluation, cards } = await deckWithCommanders(user, ['The Eternity Elevator', 'Lightning Bolt']);

    expect(evaluation.violations[0]).toEqual(
      commanderEligibility('Lightning Bolt cannot be your commander. The Eternity Elevator cannot be your commander.', [
        cards['Lightning Bolt']!,
        cards['The Eternity Elevator']!,
      ]),
    );
  });

  test('a Background can be a commander beside a commander with choose a Background, and not beside another commander', async () => {
    const user = await signUpNewUser();

    const withWilson = await deckWithCommanders(user, ['Wilson, Refined Grizzly', 'Dungeon Delver']);
    const withKrenko = await deckWithCommanders(user, ['Krenko, Mob Boss', 'Dungeon Delver']);

    expect(withWilson.evaluation).toMatchObject({ validity: 'valid', violations: [], undetermined: [] });
    expect(withKrenko.evaluation.violations.map((violation) => violation.rule)).toEqual(['commander_eligibility', 'partner']);
    expect(withKrenko.evaluation.violations[0]).toEqual(
      commanderEligibility('Dungeon Delver cannot be your commander.', [withKrenko.cards['Dungeon Delver']!]),
    );
  });
});

describe('partner', () => {
  test.each<[string, CardName, CardName]>([
    ['partner', 'Tymna the Weaver', 'Thrasios, Triton Hero'],
    ['the same partner ability with the same text', 'Sophina, Spearsage Deserter', 'Othelm, Sigardian Outcast'],
    ['partner with, when each names the other', 'Amy Pond', 'Rory Williams'],
    ['choose a Background and a Background', 'Wilson, Refined Grizzly', 'Dungeon Delver'],
    ["Doctor's companion and a Time Lord Doctor", 'Clara Oswald', 'The Tenth Doctor'],
    ["another Doctor's companion and a Time Lord Doctor", 'Peri Brown', 'The Tenth Doctor'],
  ])('two commanders with %s are a pair', async (_, first, second) => {
    const user = await signUpNewUser();

    const { evaluation } = await deckWithCommanders(user, [first, second]);

    expect(evaluation).toMatchObject({ validity: 'valid', violations: [], undetermined: [] });
  });

  test.each<[string, CardName, CardName]>([
    ['partner and no partner ability', 'Tymna the Weaver', 'Krenko, Mob Boss'],
    ['partner and a partner ability with text', 'Tymna the Weaver', 'Sophina, Spearsage Deserter'],
    ['partner abilities with different text', 'Sophina, Spearsage Deserter', 'Ellie, Brick Master'],
    ['partner with and a commander it does not name', 'Amy Pond', 'Tymna the Weaver'],
    ["Doctor's companion and a commander that is not a Time Lord Doctor", 'Clara Oswald', 'Krenko, Mob Boss'],
    ['choose a Background and a commander that is not a Background', 'Wilson, Refined Grizzly', 'Krenko, Mob Boss'],
  ])('two commanders with %s are not a pair, and the violation names both', async (_, first, second) => {
    const user = await signUpNewUser();

    const { evaluation, cards } = await deckWithCommanders(user, [first, second]);

    const [named, other] = [first, second].toSorted() as [CardName, CardName];
    expect(evaluation).toMatchObject({
      validity: 'invalid',
      violations: [partner(`${named} and ${other} cannot be commanders together.`, [cards[named]!, cards[other]!])],
      undetermined: [],
    });
  });
});

describe('commander checks that cannot be determined', () => {
  const changedText: Partial<Record<CardName, string>> = {
    'Tymna the Weaver': 'You can have Tymna and a partner with any name as commanders.',
    'Wilson, Refined Grizzly': 'Choose a Background or a Doctor',
    'Clara Oswald': "Doctor's companion or partner with a Doctor",
  };
  let user: TestUser;
  const krenkoCopies: DeckCopy[] = [];

  function cannotRead(name: CardName, card: DeckEvaluationCard): UndeterminedCheck {
    return { rule: 'partner', reason: `mtgscan cannot read the partner ability of ${name}.`, cards: [card] };
  }

  beforeAll(async () => {
    user = await signUpNewUser();
    for (let count = 0; count < 4; count += 1) {
      krenkoCopies.push(await scannedCopy(user, 'Krenko, Mob Boss'));
    }
    const manifest = await catalogFixture({
      updatedAt: '2026-10-15T21:00:00.000+00:00',
      oracleCards: (records) =>
        withoutCards(['Krenko, Mob Boss'])
          .oracleCards(records)
          .map((record) => (record.name! in changedText ? { ...record, oracle_text: changedText[record.name as CardName] } : record)),
      defaultCards: withoutCards(['Krenko, Mob Boss']).defaultCards,
    });
    expect((await runCatalogImport(manifest)).exitCode).toBe(0);
  });

  afterAll(async () => {
    await resetCardCatalog();
    expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  });

  test.each<[string, CardName, CardName]>([
    ['an unknown partner ability', 'Tymna the Weaver', 'Thrasios, Triton Hero'],
    ['an unknown choose a Background', 'Wilson, Refined Grizzly', 'Dungeon Delver'],
    ["an unknown Doctor's companion", 'Clara Oswald', 'The Tenth Doctor'],
  ])('%s makes the partner check undetermined in a deck with two commanders', async (_, unknown, other) => {
    const { evaluation, cards } = await deckWithCommanders(user, [unknown, other]);

    expect(evaluation).toMatchObject({
      validity: 'cannot_be_determined',
      violations: [],
      undetermined: [cannotRead(unknown, cards[unknown]!)],
    });
  });

  test.each<[string, CardName]>([
    ['an unknown partner ability', 'Tymna the Weaver'],
    ['an unknown choose a Background', 'Wilson, Refined Grizzly'],
    ["an unknown Doctor's companion", 'Clara Oswald'],
  ])('%s needs no check in a deck with one commander', async (_, unknown) => {
    const { evaluation } = await deckWithCommanders(user, [unknown]);

    expect(evaluation).toMatchObject({ validity: 'valid', violations: [], undetermined: [] });
  });

  test('a commander with no rules data makes commander eligibility undetermined', async () => {
    const { evaluation, cards } = await deckWith(user, [krenkoCopies.pop()!]);

    expect(evaluation).toMatchObject({ validity: 'cannot_be_determined', violations: [] });
    expect(commanderChecks(evaluation.undetermined)).toEqual([
      { rule: 'commander_eligibility', reason: 'No rules data for Krenko, Mob Boss.', cards: [cards['Krenko, Mob Boss']!] },
    ]);
  });

  test('a violation wins over an undetermined check', async () => {
    const { evaluation, cards } = await deckWith(user, [krenkoCopies.pop()!, await scannedCopy(user, 'Lightning Bolt')]);

    expect(evaluation).toMatchObject({
      validity: 'invalid',
      violations: [commanderEligibility('Lightning Bolt cannot be your commander.', [cards['Lightning Bolt']!])],
    });
    expect(commanderChecks(evaluation.undetermined)).toEqual([
      { rule: 'commander_eligibility', reason: 'No rules data for Krenko, Mob Boss.', cards: [cards['Krenko, Mob Boss']!] },
      { rule: 'partner', reason: 'No rules data for Krenko, Mob Boss.', cards: [cards['Krenko, Mob Boss']!] },
    ]);
  });

  test('a main deck card with no rules data leaves the commander checks determined', async () => {
    const { evaluation } = await deckWith(user, [await scannedCopy(user, 'Thrasios, Triton Hero')], [krenkoCopies.pop()!]);

    expect(evaluation.violations).toEqual([]);
    expect(commanderChecks(evaluation.undetermined)).toEqual([]);
  });

  test('a commander with no rules data beside a Background makes the checks undetermined, not a violation', async () => {
    const { evaluation, cards } = await deckWith(user, [krenkoCopies.pop()!, await scannedCopy(user, 'Dungeon Delver')]);

    expect(evaluation.violations).toEqual([]);
    expect(commanderChecks(evaluation.undetermined)).toEqual([
      { rule: 'commander_eligibility', reason: 'No rules data for Krenko, Mob Boss.', cards: [cards['Krenko, Mob Boss']!] },
      { rule: 'partner', reason: 'No rules data for Krenko, Mob Boss.', cards: [cards['Krenko, Mob Boss']!] },
    ]);
  });
});

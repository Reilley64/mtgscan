import { afterEach, beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import { readDeckError, type CreatedDeck, type Deck, type DeckEvaluationCard, type Violation } from '../decks';
import type { Color } from '../search';
import { basicLand, catalogFixtureManifest, oracleIdOf, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const printings = {
  atraxa: '7cc19f85-7ef6-4fd2-83e5-0dbae1d80f2b',
  counterspell: '0df55e3f-14de-46ef-b6b1-616618724d9e',
  dryadArbor: '5c4fb7f9-a551-4253-a46e-f6284d355388',
  fog: '6678a7f2-ff1f-4755-ad40-b8eebc313ae9',
  lightningBolt: 'd573ef03-4730-45aa-93dd-e45ac1dbaf4a',
  matopiGolem: '92378d6f-89ee-49dc-8964-0e9c55daeffc',
  piper: 'c78c2713-39e7-4a6e-a132-027099a89665',
  thrasios: '21e27b91-c7f1-4709-aa0d-8b5d81b22a0a',
  tolabow: 'f42c02c2-e3d8-4690-8a93-7c7a4c96bdd6',
  tymna: 'bc7cbe9b-324e-42b8-94e2-36e91cb32163',
};

type CardName = keyof typeof printings;

const foilOnly: CardName[] = ['atraxa', 'thrasios', 'tymna'];

type DeckSeed = {
  commanders: CardName[];
  main?: CardName[];
  basicLands?: Record<string, number>;
};

const restoreRulesData: (() => Promise<unknown>)[] = [];

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

afterEach(async () => {
  for (const restore of restoreRulesData.splice(0)) {
    await restore();
  }
});

async function succeeded(user: TestUser, name: string, request: Record<string, unknown>) {
  const { error } = await user.client.rpc(name as 'create_deck', { request: request as Json });
  expect(error && readDeckError(error)).toBeNull();
}

async function deckOf(user: TestUser, { commanders, main = [], basicLands = {} }: DeckSeed) {
  const { data } = await user.client.rpc('create_deck', { request: { name: 'Kinnan' } });
  const deckId = (data as unknown as CreatedDeck).deck_id;
  const copies: Record<string, string> = {};
  for (const name of [...commanders, ...main]) {
    const scanned = stack(printings[name], { finish: foilOnly.includes(name) ? 'foil' : 'nonfoil' });
    await committed(user, scanBatch([scanned]));
    copies[name] = scanned.copy_ids[0]!;
    await succeeded(user, 'add_deck_card', { deck_id: deckId, copy_id: copies[name], unprotect: false });
  }
  for (const name of commanders) {
    await succeeded(user, 'set_deck_commander', { copy_id: copies[name], commander: true });
  }
  await setBasicLands(user, deckId, basicLands);
  return { deckId, copies };
}

async function setBasicLands(user: TestUser, deckId: string, counts: Record<string, number>) {
  await succeeded(user, 'set_basic_lands', {
    deck_id: deckId,
    counts: Object.entries(counts).map(([name, count]) => ({ oracle_id: basicLand(name).oracle_id, count })),
  });
}

async function colorIdentityOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  const evaluation = (data as unknown as Deck).evaluation!;
  return {
    violations: evaluation.violations.filter((violation) => violation.rule === 'color_identity'),
    undetermined: evaluation.undetermined.filter((check) => check.rule === 'color_identity'),
    chosen_color: evaluation.chosen_color,
  };
}

function copyCard(copyId: string | undefined, name: string): DeckEvaluationCard {
  return { kind: 'copy', copy_id: copyId!, name, image_uris: [expect.stringContaining('https://cards.scryfall.io/normal/')] };
}

function basicLandCard(name: string): DeckEvaluationCard {
  return { kind: 'basic_land', oracle_id: basicLand(name).oracle_id, name, image_uris: [expect.stringContaining('https://cards.scryfall.io/normal/')] };
}

function colorIdentityViolation(message: string, colors: Color[], cards: DeckEvaluationCard[]): Violation {
  return { rule: 'color_identity', citation: 'CR 903.5c', message, hint: null, cards, colors };
}

async function changeRulesData(cardName: string, change: 'absent' | 'colorless') {
  const oracleId = await oracleIdOf(cardName);
  const [before] = await asDatabaseOwner(
    (database) => database`select absent_since, color_identity::text from public.cards where oracle_id = ${oracleId}`,
  );
  restoreRulesData.push(() =>
    asDatabaseOwner(
      (database) => database`
        update public.cards
        set absent_since = ${before!.absent_since}, color_identity = ${before!.color_identity}::text[]
        where oracle_id = ${oracleId}
      `,
    ),
  );
  await asDatabaseOwner((database) =>
    change === 'absent'
      ? database`update public.cards set absent_since = now() where oracle_id = ${oracleId}`
      : database`update public.cards set color_identity = '{}' where oracle_id = ${oracleId}`,
  );
}

describe('color identity', () => {
  test("a colored card and a basic land outside the commanders' color identity break color identity", async () => {
    const user = await signUpNewUser();
    const { deckId, copies } = await deckOf(user, {
      commanders: ['thrasios', 'tymna'],
      main: ['lightningBolt', 'counterspell'],
      basicLands: { Mountain: 2, Island: 3, Plains: 1 },
    });

    expect(await colorIdentityOf(user, deckId)).toEqual({
      violations: [
        colorIdentityViolation('3 cards are outside Green, White, Blue, and Black.', ['R'], [
          copyCard(copies.lightningBolt, 'Lightning Bolt'),
          basicLandCard('Mountain'),
        ]),
      ],
      undetermined: [],
      chosen_color: null,
    });
  });

  test('the message names one card and the color identity in color order', async () => {
    const user = await signUpNewUser();
    const thrasios = await deckOf(user, { commanders: ['thrasios'], main: ['lightningBolt'] });
    const atraxa = await deckOf(user, { commanders: ['atraxa'], basicLands: { Mountain: 1 } });

    expect((await colorIdentityOf(user, thrasios.deckId)).violations.map((violation) => violation.message)).toEqual([
      '1 card is outside Green and Blue.',
    ]);
    expect((await colorIdentityOf(user, atraxa.deckId)).violations.map((violation) => violation.message)).toEqual([
      '1 card is outside Green, White, Blue, and Black.',
    ]);
  });

  test('cards inside the color identity, colorless cards, and basic lands of its colors keep color identity', async () => {
    const user = await signUpNewUser();
    const { deckId } = await deckOf(user, {
      commanders: ['thrasios'],
      main: ['counterspell', 'fog', 'matopiGolem'],
      basicLands: { Forest: 2, Island: 2, Wastes: 1 },
    });

    expect(await colorIdentityOf(user, deckId)).toEqual({ violations: [], undetermined: [], chosen_color: null });
  });

  test('a nonbasic card with a basic land type is checked by the color of mana that type makes', async () => {
    const user = await signUpNewUser();
    await changeRulesData('Dryad Arbor', 'colorless');
    const { deckId, copies } = await deckOf(user, { commanders: ['tymna'], main: ['dryadArbor'] });

    expect((await colorIdentityOf(user, deckId)).violations).toEqual([
      colorIdentityViolation('1 card is outside White and Black.', ['G'], [copyCard(copies.dryadArbor, 'Dryad Arbor')]),
    ]);
  });

  test('a deck with no commander skips color identity', async () => {
    const user = await signUpNewUser();
    const { deckId } = await deckOf(user, { commanders: [], main: ['lightningBolt'], basicLands: { Mountain: 1 } });

    expect(await colorIdentityOf(user, deckId)).toEqual({ violations: [], undetermined: [], chosen_color: null });
  });
});

describe('the chosen color', () => {
  test('a commander that chooses a color takes the one color that every card outside the color identity shares', async () => {
    const user = await signUpNewUser();
    const { deckId } = await deckOf(user, { commanders: ['piper'], main: ['counterspell'], basicLands: { Island: 2 } });

    expect(await colorIdentityOf(user, deckId)).toEqual({ violations: [], undetermined: [], chosen_color: 'U' });
  });

  test('the chosen color adds to the color identity of the other commander', async () => {
    const user = await signUpNewUser();
    const { deckId } = await deckOf(user, { commanders: ['piper', 'tymna'], main: ['lightningBolt', 'counterspell'] });

    expect((await colorIdentityOf(user, deckId)).chosen_color).toBeNull();

    const fitting = await deckOf(user, { commanders: ['piper', 'tymna'], main: ['lightningBolt'], basicLands: { Plains: 1 } });
    expect(await colorIdentityOf(user, fitting.deckId)).toEqual({ violations: [], undetermined: [], chosen_color: 'R' });
  });

  test('with no card outside the color identity, the deck has no chosen color', async () => {
    const user = await signUpNewUser();
    const { deckId } = await deckOf(user, { commanders: ['piper'], main: ['matopiGolem'], basicLands: { Wastes: 1 } });

    expect(await colorIdentityOf(user, deckId)).toEqual({ violations: [], undetermined: [], chosen_color: null });
  });

  test('with cards outside the color identity in two colors, the deck has no chosen color and those cards break color identity', async () => {
    const user = await signUpNewUser();
    const { deckId, copies } = await deckOf(user, { commanders: ['piper'], main: ['lightningBolt', 'counterspell', 'matopiGolem'] });

    expect(await colorIdentityOf(user, deckId)).toEqual({
      violations: [
        colorIdentityViolation('2 cards are outside colorless.', ['U', 'R'], [
          copyCard(copies.counterspell, 'Counterspell'),
          copyCard(copies.lightningBolt, 'Lightning Bolt'),
        ]),
      ],
      undetermined: [],
      chosen_color: null,
    });
  });

  test('a commander that does not choose a color adds no color', async () => {
    const user = await signUpNewUser();
    const { deckId, copies } = await deckOf(user, { commanders: ['tymna'], main: ['counterspell'] });

    expect(await colorIdentityOf(user, deckId)).toEqual({
      violations: [colorIdentityViolation('1 card is outside White and Black.', ['U'], [copyCard(copies.counterspell, 'Counterspell')])],
      undetermined: [],
      chosen_color: null,
    });
  });
});

describe('undetermined color identity', () => {
  test('a card with no rules data makes color identity undetermined for that card, once for all its copies', async () => {
    const user = await signUpNewUser();
    const { deckId, copies } = await deckOf(user, { commanders: ['thrasios'], main: ['lightningBolt'] });
    const secondBolt = stack(printings.lightningBolt);
    await committed(user, scanBatch([secondBolt]));
    await succeeded(user, 'add_deck_card', { deck_id: deckId, copy_id: secondBolt.copy_ids[0], unprotect: false });
    await changeRulesData('Lightning Bolt', 'absent');
    await setBasicLands(user, deckId, { Island: 1 });

    expect(await colorIdentityOf(user, deckId)).toEqual({
      violations: [],
      undetermined: [
        {
          rule: 'color_identity',
          reason: 'No rules data for Lightning Bolt.',
          cards: [copies.lightningBolt!, secondBolt.copy_ids[0]!].sort().map((copyId) => copyCard(copyId, 'Lightning Bolt')),
        },
      ],
      chosen_color: null,
    });
  });

  test('a commander with no rules data makes color identity undetermined and names no card outside it', async () => {
    const user = await signUpNewUser();
    const { deckId, copies } = await deckOf(user, { commanders: ['thrasios'], main: ['lightningBolt'] });
    await changeRulesData('Thrasios, Triton Hero', 'absent');
    await setBasicLands(user, deckId, { Island: 1 });

    expect(await colorIdentityOf(user, deckId)).toEqual({
      violations: [],
      undetermined: [
        { rule: 'color_identity', reason: 'No rules data for Thrasios, Triton Hero.', cards: [copyCard(copies.thrasios, 'Thrasios, Triton Hero')] },
      ],
      chosen_color: null,
    });
  });

  test('a commander that mtgscan cannot tell chooses a color makes color identity undetermined when the cards outside it share one color', async () => {
    const user = await signUpNewUser();
    const { deckId, copies } = await deckOf(user, { commanders: ['tolabow'], main: ['lightningBolt'] });

    expect(await colorIdentityOf(user, deckId)).toEqual({
      violations: [],
      undetermined: [
        {
          rule: 'color_identity',
          reason: 'mtgscan cannot read whether Tolabow, Loch Rascal chooses a color.',
          cards: [copyCard(copies.tolabow, 'Tolabow, Loch Rascal'), copyCard(copies.lightningBolt, 'Lightning Bolt')],
        },
      ],
      chosen_color: null,
    });
  });

  test('whether a commander chooses a color is not needed with no card outside the color identity, or with cards outside it in two colors', async () => {
    const user = await signUpNewUser();
    const inside = await deckOf(user, { commanders: ['tolabow'], main: ['counterspell'] });
    const twoColors = await deckOf(user, { commanders: ['tolabow'], main: ['lightningBolt', 'fog'] });

    expect(await colorIdentityOf(user, inside.deckId)).toEqual({ violations: [], undetermined: [], chosen_color: null });
    expect(await colorIdentityOf(user, twoColors.deckId)).toEqual({
      violations: [
        colorIdentityViolation('2 cards are outside Blue.', ['R', 'G'], [copyCard(twoColors.copies.fog, 'Fog'), copyCard(twoColors.copies.lightningBolt, 'Lightning Bolt')]),
      ],
      undetermined: [],
      chosen_color: null,
    });
  });
});

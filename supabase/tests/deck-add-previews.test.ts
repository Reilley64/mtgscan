import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import { readDeckError, type AddDeckCardPreview, type CreatedDeck, type Deck, type DeckChangeEffect } from '../decks';
import { basicLand, catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { anonymousClient, asDatabaseOwner, secretKeyClient, signUpNewUser, type AppClient, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const krenko = 'aa078518-0ce2-4c6f-9061-aa7e22ed7493';
const lightningBolt = '132dc07f-74e2-4bd7-bdb1-4f5d5253c7f2';
const sevenDwarves = '464adbae-70ea-48e1-b8ae-b404766f7a5a';
const blackLotus = 'b0faa7f2-b547-42c4-a810-839da50dadfe';
const counterspell = '0df55e3f-14de-46ef-b6b1-616618724d9e';
const [mountain, snowCoveredMountain, island] = ['Mountain', 'Snow-Covered Mountain', 'Island'].map((name) => basicLand(name).oracle_id) as [
  string,
  string,
  string,
];

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function succeeded(user: TestUser, name: string, request: Record<string, unknown>) {
  const { error } = await user.client.rpc(name as 'create_deck', { request: request as Json });
  expect(error && readDeckError(error)).toBeNull();
}

async function scannedCopy(user: TestUser, cardPrintingId: string) {
  const scanned = stack(cardPrintingId);
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids[0]!;
}

async function created(user: TestUser) {
  const { data, error } = await user.client.rpc('create_deck', { request: { name: 'Krenko' } });
  expect(error).toBeNull();
  return (data as unknown as CreatedDeck).deck_id;
}

async function addedCopy(user: TestUser, deckId: string, cardPrintingId: string) {
  const copyId = await scannedCopy(user, cardPrintingId);
  await succeeded(user, 'add_deck_card', { deck_id: deckId, copy_id: copyId, unprotect: false });
  return copyId;
}

async function deckOfKrenko(user: TestUser, cardCount: number, cardPrintingIds: string[] = []) {
  const deckId = await created(user);
  const commander = await addedCopy(user, deckId, krenko);
  await succeeded(user, 'set_deck_commander', { copy_id: commander, commander: true });
  for (const cardPrintingId of cardPrintingIds) {
    await addedCopy(user, deckId, cardPrintingId);
  }
  const landCount = cardCount - 1 - cardPrintingIds.length;
  for (const [oracleId, by] of [
    [mountain, Math.min(landCount, 90)],
    [snowCoveredMountain, landCount - 90],
  ] as const) {
    if (by > 0) {
      await succeeded(user, 'change_basic_land', { deck_id: deckId, oracle_id: oracleId, by });
    }
  }
  return deckId;
}

async function previewOf(user: TestUser, copyId: string) {
  const { data, error } = await user.client.rpc('preview_add_deck_card', { query: { copy_id: copyId } });
  expect(error).toBeNull();
  return data as unknown as AddDeckCardPreview;
}

async function effectOf(user: TestUser, deckId: string, copyId: string) {
  return (await previewOf(user, copyId)).items.find((item) => item.deck_id === deckId)!.effect;
}

async function basicLandPreviewOf(user: TestUser, oracleId: string, count: number) {
  const { data, error } = await user.client.rpc('preview_add_deck_card', { query: { basic_land_oracle_id: oracleId, count } });
  expect(error).toBeNull();
  return data as unknown as AddDeckCardPreview;
}

async function evaluationOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return (data as unknown as Deck).evaluation!;
}

function effect(kind: DeckChangeEffect['kind'], ...rules: DeckChangeEffect['rules'][number]['rule'][]): DeckChangeEffect {
  return { kind, rules: rules.map((rule) => ({ rule })) };
}

describe('preview_add_deck_card', () => {
  test('the preview judges the deck with the copy in its main deck, as the add then saves it', async () => {
    const user = await signUpNewUser();
    const deckId = await deckOfKrenko(user, 100, [lightningBolt]);
    const secondBolt = await scannedCopy(user, lightningBolt);
    expect((await evaluationOf(user, deckId)).validity).toBe('valid');

    expect(await effectOf(user, deckId, secondBolt)).toEqual(effect('would_make_invalid', 'deck_size', 'singleton'));

    await succeeded(user, 'add_deck_card', { deck_id: deckId, copy_id: secondBolt, unprotect: false });
    const evaluation = await evaluationOf(user, deckId);
    expect(evaluation.validity).toBe('invalid');
    expect(evaluation.violations.map((violation) => violation.rule)).toEqual(['deck_size', 'singleton']);
    expect(evaluation.violations[1]!.cards).toContainEqual(expect.objectContaining({ copy_id: secondBolt }));
  });

  test('only a new violation counts: a rule the deck does not break, or a new card in a rule it breaks', async () => {
    const user = await signUpNewUser();
    const deckId = await deckOfKrenko(user, 87, [blackLotus, lightningBolt, lightningBolt]);
    expect((await evaluationOf(user, deckId)).violations.map((violation) => violation.rule)).toEqual([
      'deck_size',
      'singleton',
      'banned',
    ]);

    expect(await effectOf(user, deckId, await scannedCopy(user, sevenDwarves))).toBeNull();
    expect(await effectOf(user, deckId, await scannedCopy(user, lightningBolt))).toEqual(effect('adds_violation', 'singleton'));
    expect(await effectOf(user, deckId, await scannedCopy(user, blackLotus))).toEqual(
      effect('adds_violation', 'singleton', 'banned'),
    );
  });

  test('a color identity effect names the colors outside the color identity', async () => {
    const user = await signUpNewUser();
    const deckId = await deckOfKrenko(user, 87);

    expect(await effectOf(user, deckId, await scannedCopy(user, counterspell))).toEqual({
      kind: 'adds_violation',
      rules: [{ rule: 'color_identity', colors: ['U'] }],
    });
  });

  test('deck size counts only when the deck has exactly 100 cards before the add', async () => {
    const user = await signUpNewUser();
    const decks = new Map<string, number>();
    for (const cardCount of [87, 99, 100, 101]) {
      decks.set(await deckOfKrenko(user, cardCount), cardCount);
    }

    const { items } = await previewOf(user, await scannedCopy(user, sevenDwarves));

    const effects = items.map((item): [number, DeckChangeEffect | null] => [decks.get(item.deck_id)!, item.effect]);
    expect(effects.toSorted(([a], [b]) => a - b)).toEqual([
      [87, null],
      [99, null],
      [100, effect('would_make_invalid', 'deck_size')],
      [101, null],
    ]);
  });

  test('the kind follows the stored validity: adds_violation when invalid, would_make_invalid when valid or cannot be determined', async () => {
    const user = await signUpNewUser();
    const invalid = await deckOfKrenko(user, 87);
    const valid = await deckOfKrenko(user, 100);
    const cannotBeDetermined = await deckOfKrenko(user, 100);
    await asDatabaseOwner(
      (database) =>
        database`update public.deck_evaluations set validity = 'cannot_be_determined' where deck_id = ${cannotBeDetermined}`,
    );
    const lotus = await scannedCopy(user, blackLotus);

    expect(await effectOf(user, invalid, lotus)).toEqual(effect('adds_violation', 'banned'));
    expect(await effectOf(user, valid, lotus)).toEqual(effect('would_make_invalid', 'deck_size', 'banned'));
    expect(await effectOf(user, cannotBeDetermined, lotus)).toEqual(effect('would_make_invalid', 'deck_size', 'banned'));
  });

  test('an empty deck has no effect', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);

    expect(await previewOf(user, await scannedCopy(user, blackLotus))).toEqual({ items: [{ deck_id: deckId, effect: null }] });
  });

  test('the preview changes nothing', async () => {
    const user = await signUpNewUser();
    const deckId = await deckOfKrenko(user, 100);
    const lotus = await scannedCopy(user, blackLotus);
    const stored = () =>
      asDatabaseOwner(
        (database) => database`
          select deck.revision, evaluation.judged_at, evaluation.violations
          from public.decks deck
          join public.deck_evaluations evaluation on evaluation.deck_id = deck.id
          where deck.id = ${deckId}`,
      );
    const before = await stored();

    expect(await effectOf(user, deckId, lotus)).toEqual(effect('would_make_invalid', 'deck_size', 'banned'));

    expect(await stored()).toEqual(before);
    const { data } = await user.client.from('deck_cards').select('copy_id').eq('copy_id', lotus);
    expect(data).toEqual([]);
  });
});

describe('preview_add_deck_card for a basic land card', () => {
  test('the preview judges each deck with that many more of the basic land card', async () => {
    const user = await signUpNewUser();
    const valid = await deckOfKrenko(user, 100);
    const invalid = await deckOfKrenko(user, 87);
    const effectsOf = async (oracleId: string, count: number) =>
      new Map((await basicLandPreviewOf(user, oracleId, count)).items.map((item) => [item.deck_id, item.effect]));

    const mountains = await effectsOf(mountain, 2);
    expect(mountains.get(valid)).toEqual(effect('would_make_invalid', 'deck_size'));
    expect(mountains.get(invalid)).toBeNull();
    expect((await effectsOf(mountain, 13)).get(invalid)).toBeNull();
    expect((await effectsOf(island, 3)).get(invalid)).toEqual({ kind: 'adds_violation', rules: [{ rule: 'color_identity', colors: ['U'] }] });
  });

  test.each<[string, Record<string, unknown>, string]>([
    ['a card that is not a basic land card', { basic_land_oracle_id: crypto.randomUUID(), count: 1 }, 'basic_land_oracle_id'],
    ['a count of 0', { basic_land_oracle_id: mountain, count: 0 }, 'count'],
    ['a count above 99', { basic_land_oracle_id: mountain, count: 100 }, 'count'],
    ['a copy and a basic land card together', { copy_id: crypto.randomUUID(), basic_land_oracle_id: mountain }, 'basic_land_oracle_id'],
    ['a count for a copy', { copy_id: crypto.randomUUID(), count: 2 }, 'count'],
    ['neither a copy nor a basic land card', {}, 'copy_id'],
  ])('%s is refused with invalid_argument', async (_, query, field) => {
    const user = await signUpNewUser();

    const { error } = await user.client.rpc('preview_add_deck_card', { query: query as Json });

    expect(readDeckError(error!)).toMatchObject({ code: 'invalid_argument', field });
  });
});

describe('access', () => {
  test("the preview lists only the caller's decks, and another user's copy is not found", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    await deckOfKrenko(alice, 100);
    const alicesCopy = await scannedCopy(alice, blackLotus);
    const bobsDeck = await created(bob);

    expect(await previewOf(bob, await scannedCopy(bob, blackLotus))).toEqual({ items: [{ deck_id: bobsDeck, effect: null }] });
    const { error } = await bob.client.rpc('preview_add_deck_card', { query: { copy_id: alicesCopy } });
    expect(readDeckError(error!)).toMatchObject({ code: 'not_found', field: 'copy_id' });
  });

  test("the preview of a basic land card lists only the caller's decks", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    await deckOfKrenko(alice, 100);
    const bobsDeck = await created(bob);

    expect(await basicLandPreviewOf(bob, mountain, 1)).toEqual({ items: [{ deck_id: bobsDeck, effect: null }] });
  });

  test.each<[string, () => AppClient]>([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot preview an add', async (_, client) => {
    const { error } = await client().rpc('preview_add_deck_card', { query: { copy_id: crypto.randomUUID() } });

    expect(error?.code).toBe(permissionDenied);
  });
});

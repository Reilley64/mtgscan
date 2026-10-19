import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  addDeckCard,
  changeBasicLand,
  getDeck,
  listDeckChanges,
  previewRevert,
  removeDeckCard,
  revertDeckChanges,
  setDeckCommander,
  type DeckChangeEffect,
} from '../decks';
import { basicLand, catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { replyOf } from './database-calls';
import { createdDeck } from './deck-calls';
import { asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const krenko = 'aa078518-0ce2-4c6f-9061-aa7e22ed7493';
const lightningBolt = '132dc07f-74e2-4bd7-bdb1-4f5d5253c7f2';
const sevenDwarves = '464adbae-70ea-48e1-b8ae-b404766f7a5a';
const blackLotus = 'b0faa7f2-b547-42c4-a810-839da50dadfe';
const counterspell = '0df55e3f-14de-46ef-b6b1-616618724d9e';
const mountain = basicLand('Mountain').oracle_id;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function addedCopy(user: TestUser, deckId: string, cardPrintingId: string) {
  const scanned = stack(cardPrintingId);
  await committed(user, scanBatch([scanned]));
  const copyId = scanned.copy_ids[0]!;
  await replyOf(user.client, addDeckCard, { deck_id: deckId, copy_id: copyId, unprotect: false });
  return copyId;
}

async function removed(user: TestUser, copyId: string) {
  await replyOf(user.client, removeDeckCard, { copy_id: copyId });
}

async function madeCommander(user: TestUser, copyId: string) {
  await replyOf(user.client, setDeckCommander, { copy_id: copyId, commander: true });
}

async function mountainsChanged(user: TestUser, deckId: string, by: number) {
  await replyOf(user.client, changeBasicLand, { deck_id: deckId, oracle_id: mountain, by });
}

async function deckOfKrenko(user: TestUser, cardCount: number, cardPrintingIds: string[] = []) {
  const deckId = await createdDeck(user, 'Krenko');
  const commander = await addedCopy(user, deckId, krenko);
  await madeCommander(user, commander);
  for (const cardPrintingId of cardPrintingIds) {
    await addedCopy(user, deckId, cardPrintingId);
  }
  await mountainsChanged(user, deckId, cardCount - 1 - cardPrintingIds.length);
  return deckId;
}

async function lastChange(user: TestUser, deckId: string) {
  return (await replyOf(user.client, listDeckChanges, { deck_id: deckId })).items[0]!.deck_change_id;
}

async function previewOf(user: TestUser, deckId: string, deckChangeId: string) {
  return replyOf(user.client, previewRevert, { deck_id: deckId, deck_change_id: deckChangeId });
}

async function evaluationOf(user: TestUser, deckId: string) {
  return (await replyOf(user.client, getDeck, { deck_id: deckId })).evaluation;
}

function effect(kind: DeckChangeEffect['kind'], ...rules: DeckChangeEffect['rules'][number]['rule'][]): DeckChangeEffect {
  return { kind, rules: rules.map((rule) => ({ rule })) };
}

describe('the effect of a revert', () => {
  test('the preview judges the deck as the revert would leave it, as the revert then saves it', async () => {
    const user = await signUpNewUser();
    const deckId = await deckOfKrenko(user, 100, [lightningBolt]);
    const secondBolt = await addedCopy(user, deckId, lightningBolt);
    await removed(user, secondBolt);
    const deckChangeId = await lastChange(user, deckId);
    expect((await evaluationOf(user, deckId))!.validity).toBe('valid');

    const preview = await previewOf(user, deckId, deckChangeId);

    expect(preview.effect).toEqual(effect('would_make_invalid', 'deck_size', 'singleton'));
    await replyOf(user.client, revertDeckChanges, { deck_id: deckId, deck_change_id: deckChangeId, expected_revision: preview.revision, unprotect: false });
    const evaluation = (await evaluationOf(user, deckId))!;
    expect(evaluation.violations.map((violation) => violation.rule)).toEqual(['deck_size', 'singleton']);
    expect(evaluation.violations[1]!.cards).toContainEqual(expect.objectContaining({ copy_id: secondBolt }));
  });

  test('a revert that takes the commander out judges the deck without it', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Krenko');
    await mountainsChanged(user, deckId, 99);
    const commander = await addedCopy(user, deckId, krenko);
    const commanderAdded = await lastChange(user, deckId);
    await madeCommander(user, commander);
    expect((await evaluationOf(user, deckId))!.validity).toBe('valid');

    expect((await previewOf(user, deckId, commanderAdded)).effect).toEqual(effect('would_make_invalid', 'no_commander', 'deck_size'));
  });

  test('only a new violation counts, and an invalid deck gives adds_violation', async () => {
    const user = await signUpNewUser();
    const deckId = await deckOfKrenko(user, 87, [blackLotus, lightningBolt, lightningBolt]);
    await removed(user, await addedCopy(user, deckId, lightningBolt));
    const thirdBoltRemoved = await lastChange(user, deckId);
    await removed(user, await addedCopy(user, deckId, sevenDwarves));
    expect((await evaluationOf(user, deckId))!.violations.map((violation) => violation.rule)).toEqual(['deck_size', 'singleton', 'banned']);

    expect((await previewOf(user, deckId, await lastChange(user, deckId))).effect).toBeNull();
    expect((await previewOf(user, deckId, thirdBoltRemoved)).effect).toEqual(effect('adds_violation', 'singleton'));
  });

  test('a color identity effect names the colors outside the color identity', async () => {
    const user = await signUpNewUser();
    const deckId = await deckOfKrenko(user, 87);
    await removed(user, await addedCopy(user, deckId, counterspell));

    expect((await previewOf(user, deckId, await lastChange(user, deckId))).effect).toEqual({
      kind: 'adds_violation',
      rules: [{ rule: 'color_identity', colors: ['U'] }],
    });
  });

  test('a revert that leaves the deck empty has no effect', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Krenko');
    const commander = await addedCopy(user, deckId, krenko);
    const commanderAdded = await lastChange(user, deckId);
    await madeCommander(user, commander);
    expect((await evaluationOf(user, deckId))!.violations.map((violation) => violation.rule)).toEqual(['deck_size']);

    expect((await previewOf(user, deckId, commanderAdded)).effect).toBeNull();
  });

  test('an empty deck has no effect', async () => {
    const user = await signUpNewUser();
    const deckId = await createdDeck(user, 'Krenko');
    await removed(user, await addedCopy(user, deckId, blackLotus));
    expect(await evaluationOf(user, deckId)).toBeNull();

    expect((await previewOf(user, deckId, await lastChange(user, deckId))).effect).toBeNull();
  });

  test('the preview changes nothing', async () => {
    const user = await signUpNewUser();
    const deckId = await deckOfKrenko(user, 100);
    const lotus = await addedCopy(user, deckId, blackLotus);
    await removed(user, lotus);
    const stored = () =>
      asDatabaseOwner(
        (database) => database`
          select deck.revision, evaluation.judged_at, evaluation.violations
          from public.decks deck
          join public.deck_evaluations evaluation on evaluation.deck_id = deck.id
          where deck.id = ${deckId}`,
      );
    const before = await stored();

    expect((await previewOf(user, deckId, await lastChange(user, deckId))).effect).toEqual(effect('would_make_invalid', 'deck_size', 'banned'));

    expect(await stored()).toEqual(before);
    const { data } = await user.client.from('deck_cards').select('copy_id').eq('copy_id', lotus);
    expect(data).toEqual([]);
  });
});

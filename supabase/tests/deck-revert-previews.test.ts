import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import { readDeckError, type CreatedDeck, type Deck, type DeckChangeEffect, type DeckChangePage, type RevertPreview } from '../decks';
import { basicLand, catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
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

async function succeeded(user: TestUser, name: string, request: Record<string, unknown>) {
  const { error } = await user.client.rpc(name as 'create_deck', { request: request as Json });
  expect(error && readDeckError(error)).toBeNull();
}

async function created(user: TestUser) {
  const { data, error } = await user.client.rpc('create_deck', { request: { name: 'Krenko' } });
  expect(error).toBeNull();
  return (data as unknown as CreatedDeck).deck_id;
}

async function addedCopy(user: TestUser, deckId: string, cardPrintingId: string) {
  const scanned = stack(cardPrintingId);
  await committed(user, scanBatch([scanned]));
  const copyId = scanned.copy_ids[0]!;
  await succeeded(user, 'add_deck_card', { deck_id: deckId, copy_id: copyId, unprotect: false });
  return copyId;
}

const removed = (user: TestUser, copyId: string) => succeeded(user, 'remove_deck_card', { copy_id: copyId });

async function deckOfKrenko(user: TestUser, cardCount: number, cardPrintingIds: string[] = []) {
  const deckId = await created(user);
  const commander = await addedCopy(user, deckId, krenko);
  await succeeded(user, 'set_deck_commander', { copy_id: commander, commander: true });
  for (const cardPrintingId of cardPrintingIds) {
    await addedCopy(user, deckId, cardPrintingId);
  }
  await succeeded(user, 'set_basic_lands', {
    deck_id: deckId,
    counts: [{ oracle_id: mountain, count: cardCount - 1 - cardPrintingIds.length }],
  });
  return deckId;
}

async function lastChange(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('list_deck_changes', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return (data as unknown as DeckChangePage).items[0]!.deck_change_id;
}

async function previewOf(user: TestUser, deckId: string, deckChangeId: string) {
  const { data, error } = await user.client.rpc('preview_revert', { query: { deck_id: deckId, deck_change_id: deckChangeId } });
  expect(error).toBeNull();
  return data as unknown as RevertPreview;
}

async function evaluationOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return (data as unknown as Deck).evaluation;
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
    await succeeded(user, 'revert_deck_changes', { deck_id: deckId, deck_change_id: deckChangeId, expected_revision: preview.revision, unprotect: false });
    const evaluation = (await evaluationOf(user, deckId))!;
    expect(evaluation.violations.map((violation) => violation.rule)).toEqual(['deck_size', 'singleton']);
    expect(evaluation.violations[1]!.cards).toContainEqual(expect.objectContaining({ copy_id: secondBolt }));
  });

  test('a revert that takes the commander out judges the deck without it', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    await succeeded(user, 'set_basic_lands', { deck_id: deckId, counts: [{ oracle_id: mountain, count: 99 }] });
    const commander = await addedCopy(user, deckId, krenko);
    const commanderAdded = await lastChange(user, deckId);
    await succeeded(user, 'set_deck_commander', { copy_id: commander, commander: true });
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
    const deckId = await created(user);
    const commander = await addedCopy(user, deckId, krenko);
    const commanderAdded = await lastChange(user, deckId);
    await succeeded(user, 'set_deck_commander', { copy_id: commander, commander: true });
    expect((await evaluationOf(user, deckId))!.violations.map((violation) => violation.rule)).toEqual(['deck_size']);

    expect((await previewOf(user, deckId, commanderAdded)).effect).toBeNull();
  });

  test('an empty deck has no effect', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
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

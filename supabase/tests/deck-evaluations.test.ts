import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Json } from '../database.types';
import {
  readDeckError,
  type CreatedDeck,
  type Deck,
  type DeckChangePage,
  type DeckList,
  type RevertPreview,
  type Violation,
} from '../decks';
import {
  basicLand,
  catalogFixtureManifest,
  catalogFixtureSnapshotAt,
  resetCardCatalog,
  runCatalogImport,
} from './catalog-import-command';
import { anonymousClient, asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const angelicCurator = '332352c2-98f2-4eb8-b49a-026a39df227b';
const delverInnistrad = '11bf83bb-c95b-4b4f-9a56-ce7a1816307a';
const relentlessRats = '75f47b6e-9557-4853-b8d6-7602a91c59a7';
const krenkoMagic2013 = 'aa078518-0ce2-4c6f-9061-aa7e22ed7493';
const [forest, wastes] = ['Forest', 'Wastes'].map((name) => basicLand(name).oracle_id) as [string, string];

const noCommander: Violation = {
  rule: 'no_commander',
  citation: 'CR 903.3',
  message: 'This deck has no commander.',
  hint: null,
  cards: [],
};

function deckSize(cardCount: number, hint: string): Violation {
  return { rule: 'deck_size', citation: 'CR 903.5a', message: `${cardCount} of 100 cards.`, hint, cards: [] };
}

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function call(user: TestUser, name: string, request: Record<string, unknown>) {
  const { error } = await user.client.rpc(name as 'create_deck', { request: request as Json });
  return error && readDeckError(error);
}

async function succeeded(user: TestUser, name: string, request: Record<string, unknown>) {
  expect(await call(user, name, request)).toBeNull();
}

async function created(user: TestUser, name = 'Atraxa') {
  const { data, error } = await user.client.rpc('create_deck', { request: { name } });
  expect(error).toBeNull();
  return (data as unknown as CreatedDeck).deck_id;
}

async function scannedCopy(user: TestUser, cardPrintingId = angelicCurator) {
  const scanned = stack(cardPrintingId);
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids[0]!;
}

const added = (user: TestUser, deckId: string, copyId: string) =>
  succeeded(user, 'add_deck_card', { deck_id: deckId, copy_id: copyId, unprotect: false });
const removed = (user: TestUser, copyId: string) => succeeded(user, 'remove_deck_card', { copy_id: copyId });
const madeCommander = (user: TestUser, copyId: string, commander = true) =>
  succeeded(user, 'set_deck_commander', { copy_id: copyId, commander });
const forestsSet = (user: TestUser, deckId: string, count: number) =>
  succeeded(user, 'set_basic_lands', { deck_id: deckId, counts: [{ oracle_id: forest, count }] });
const deleted = (user: TestUser, copyId: string) => succeeded(user, 'delete_copy', { copy_id: copyId });

async function deckOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('get_deck', { query: { deck_id: deckId } });
  expect(error).toBeNull();
  return data as unknown as Deck;
}

async function listedEvaluationOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client.rpc('list_decks');
  expect(error).toBeNull();
  return (data as unknown as DeckList).items.find((item) => item.deck_id === deckId)!.evaluation;
}

async function evaluationOf(user: TestUser, deckId: string) {
  return (await deckOf(user, deckId)).evaluation;
}

async function changeAt(user: TestUser, deckId: string, revision: number) {
  const { data } = await user.client.rpc('list_deck_changes', { query: { deck_id: deckId } });
  return (data as unknown as DeckChangePage).items.find((change) => change.revision === revision)!.deck_change_id;
}

async function revertedFrom(user: TestUser, deckId: string, revision: number) {
  const deckChangeId = await changeAt(user, deckId, revision);
  const { data: preview } = await user.client.rpc('preview_revert', { query: { deck_id: deckId, deck_change_id: deckChangeId } });
  return call(user, 'revert_deck_changes', {
    deck_id: deckId,
    deck_change_id: deckChangeId,
    expected_revision: (preview as unknown as RevertPreview).revision,
    unprotect: false,
  });
}

async function deckWithCommander(user: TestUser) {
  const deckId = await created(user);
  const commander = await scannedCopy(user, krenkoMagic2013);
  const main = await scannedCopy(user, delverInnistrad);
  await added(user, deckId, commander);
  await madeCommander(user, commander);
  await added(user, deckId, main);
  return { deckId, commander, main };
}

async function storedEvaluationRows(deckId: string) {
  return asDatabaseOwner(
    (database) => database`select revision, judged_at from public.deck_evaluations where deck_id = ${deckId}`,
  );
}

describe('deck validity', () => {
  test.each<[number, unknown[]]>([
    [87, [deckSize(87, 'Add 13 cards.')]],
    [99, [deckSize(99, 'Add 1 card.')]],
    [100, []],
    [101, [deckSize(101, 'Remove 1 card.')]],
  ])('deck size counts the commander, the main deck, and basic lands: %i cards', async (cardCount, violations) => {
    const user = await signUpNewUser();
    const { deckId } = await deckWithCommander(user);

    await forestsSet(user, deckId, cardCount - 2);

    const evaluation = await evaluationOf(user, deckId);
    expect(evaluation).toMatchObject({ validity: violations.length > 0 ? 'invalid' : 'valid', violations, undetermined: [] });
    expect(await listedEvaluationOf(user, deckId)).toEqual({ validity: evaluation!.validity, estimated_bracket: 2 });
  });

  test('basic lands of every basic land card count toward deck size', async () => {
    const user = await signUpNewUser();
    const { deckId } = await deckWithCommander(user);

    await succeeded(user, 'set_basic_lands', {
      deck_id: deckId,
      counts: [
        { oracle_id: forest, count: 90 },
        { oracle_id: wastes, count: 8 },
      ],
    });

    expect(await evaluationOf(user, deckId)).toMatchObject({ validity: 'valid', violations: [] });
  });

  test('a deck with no commander is invalid with no_commander, and deck size is still checked', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    await added(user, deckId, await scannedCopy(user));

    await forestsSet(user, deckId, 97);
    expect(await evaluationOf(user, deckId)).toMatchObject({
      validity: 'invalid',
      violations: [noCommander, deckSize(98, 'Add 2 cards.')],
    });

    await forestsSet(user, deckId, 99);
    expect(await evaluationOf(user, deckId)).toMatchObject({ validity: 'invalid', violations: [noCommander] });
  });

  test('a deck evaluation keeps the deck revision it judged and the time of the rules data it read', async () => {
    const user = await signUpNewUser();
    const { deckId } = await deckWithCommander(user);

    const deck = await deckOf(user, deckId);

    expect(deck.evaluation).toEqual({
      validity: 'invalid',
      violations: [deckSize(2, 'Add 98 cards.')],
      undetermined: [],
      estimated_bracket: 2,
      bracket_signals: [{ kind: 'game_changers', source: 'official', count: 0, lowest_bracket: 2, cards: [] }],
      missing_signal_count: 0,
      revision: deck.revision,
      catalog_at: catalogFixtureSnapshotAt,
      oracle_tags_at: null,
      commander_spellbook_at: null,
      judged_at: expect.any(String),
      validity_rules_data_at: catalogFixtureSnapshotAt,
      bracket_rules_data_at: catalogFixtureSnapshotAt,
      no_oracle_tag_data: true,
      no_combo_data: true,
    });
  });
});

describe('saving after a deck change', () => {
  test('every deck change saves a deck evaluation with its deck revision', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const [commander, main, other] = [
      await scannedCopy(user, krenkoMagic2013),
      await scannedCopy(user, delverInnistrad),
      await scannedCopy(user, relentlessRats),
    ];
    const changes: [string, () => Promise<void>, unknown[]][] = [
      ['add_deck_card', () => added(user, deckId, commander), [noCommander, deckSize(1, 'Add 99 cards.')]],
      ['set_deck_commander', () => madeCommander(user, commander), [deckSize(1, 'Add 99 cards.')]],
      ['set_basic_lands', () => forestsSet(user, deckId, 98), [deckSize(99, 'Add 1 card.')]],
      ['add_deck_card', () => added(user, deckId, main), []],
      ['add_deck_card', () => added(user, deckId, other), [deckSize(101, 'Remove 1 card.')]],
      ['remove_deck_card', () => removed(user, other), []],
      ['set_deck_commander to the main deck', () => madeCommander(user, commander, false), [noCommander]],
      ['revert_deck_changes', async () => expect(await revertedFrom(user, deckId, 7)).toBeNull(), []],
      ['delete_copy', () => deleted(user, main), [deckSize(99, 'Add 1 card.')]],
    ];

    for (const [name, change, violations] of changes) {
      await change();
      const deck = await deckOf(user, deckId);
      expect({ name, ...deck.evaluation }).toMatchObject({ name, revision: deck.revision, violations });
    }
  });

  test('the deck change that adds the first card creates the deck evaluation, and the one that removes the last card deletes it', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    const copyId = await scannedCopy(user);
    expect(await evaluationOf(user, deckId)).toBeNull();
    expect(await listedEvaluationOf(user, deckId)).toBeNull();

    await forestsSet(user, deckId, 1);
    expect(await evaluationOf(user, deckId)).toMatchObject({ revision: 1 });
    await forestsSet(user, deckId, 0);
    expect(await evaluationOf(user, deckId)).toBeNull();

    await added(user, deckId, copyId);
    expect(await evaluationOf(user, deckId)).toMatchObject({ revision: 3 });
    await removed(user, copyId);
    expect(await evaluationOf(user, deckId)).toBeNull();
    expect(await listedEvaluationOf(user, deckId)).toBeNull();

    await added(user, deckId, copyId);
    await deleted(user, copyId);
    expect(await evaluationOf(user, deckId)).toBeNull();
    expect(await storedEvaluationRows(deckId)).toEqual([]);
  });

  test('a revert that empties the deck deletes the deck evaluation, and a revert that refills it creates one', async () => {
    const user = await signUpNewUser();
    const deckId = await created(user);
    await forestsSet(user, deckId, 3);

    expect(await revertedFrom(user, deckId, 1)).toBeNull();
    expect(await evaluationOf(user, deckId)).toBeNull();

    expect(await revertedFrom(user, deckId, 2)).toBeNull();
    expect(await evaluationOf(user, deckId)).toMatchObject({ revision: 3, violations: [noCommander, deckSize(3, 'Add 97 cards.')] });
  });

  test('a refused request or one that makes no deck change saves nothing', async () => {
    const user = await signUpNewUser();
    const { deckId, commander, main } = await deckWithCommander(user);
    const [before] = await storedEvaluationRows(deckId);

    const second = await scannedCopy(user);
    await added(user, deckId, second);
    await madeCommander(user, second);
    const [afterChanges] = await storedEvaluationRows(deckId);
    expect(await call(user, 'set_deck_commander', { copy_id: main, commander: true })).toMatchObject({ code: 'commander_limit' });
    await madeCommander(user, commander);
    await succeeded(user, 'set_basic_lands', { deck_id: deckId, counts: [{ oracle_id: forest, count: 0 }] });
    expect(
      await call(user, 'revert_deck_changes', {
        deck_id: deckId,
        deck_change_id: await changeAt(user, deckId, 1),
        expected_revision: 1,
        unprotect: false,
      }),
    ).toMatchObject({ code: 'stale_revision' });
    expect(await call(user, 'add_deck_card', { deck_id: deckId, copy_id: main, unprotect: false })).toMatchObject({ code: 'copy_not_free' });

    expect(before!.revision).toBe(3);
    expect(await storedEvaluationRows(deckId)).toEqual([afterChanges]);
    expect(afterChanges!.revision).toBe(5);
  });

  test('creating, renaming, and deleting a deck, and changing its deck priority, save nothing', async () => {
    const user = await signUpNewUser();
    const empty = await created(user);
    expect(await storedEvaluationRows(empty)).toEqual([]);

    const { deckId } = await deckWithCommander(user);
    const before = await storedEvaluationRows(deckId);
    await succeeded(user, 'rename_deck', { deck_id: deckId, name: 'Kinnan' });
    await succeeded(user, 'set_deck_priority', { deck_id: deckId, priority: 'high' });
    expect(await storedEvaluationRows(deckId)).toEqual(before);

    await succeeded(user, 'delete_deck', { deck_id: deckId });
    expect(await storedEvaluationRows(deckId)).toEqual([]);
  });
});

describe('access', () => {
  test("another user's deck evaluation is unreadable through every read", async () => {
    const [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
    const { deckId } = await deckWithCommander(alice);

    const { error } = await bob.client.rpc('get_deck', { query: { deck_id: deckId } });
    expect(readDeckError(error!)).toMatchObject({ code: 'not_found', field: 'deck_id' });
    const { data: list } = await bob.client.rpc('list_decks');
    expect((list as unknown as DeckList).items).toEqual([]);
    const { data, error: readError } = await bob.client.from('deck_evaluations').select('deck_id').eq('deck_id', deckId);
    expect(readError).toBeNull();
    expect(data).toEqual([]);

    const anonymous = await anonymousClient().from('deck_evaluations').select('deck_id');
    expect(anonymous.error?.code).toBe(permissionDenied);
  });

  test('a user cannot write deck evaluations directly', async () => {
    const user = await signUpNewUser();
    const { deckId } = await deckWithCommander(user);
    const before = await storedEvaluationRows(deckId);

    const writes = [
      user.client.from('deck_evaluations').insert({
        user_id: user.userId,
        deck_id: await created(user, 'Kinnan'),
        validity: 'valid',
        violations: [],
        undetermined: [],
        estimated_bracket: 2,
        bracket_signals: [],
        missing_signal_count: 0,
        revision: 1,
      }),
      user.client.from('deck_evaluations').update({ validity: 'valid' }).eq('deck_id', deckId),
      user.client.from('deck_evaluations').delete().eq('deck_id', deckId),
    ];
    for (const { error } of await Promise.all(writes)) {
      expect(error?.code).toBe(permissionDenied);
    }
    expect(await storedEvaluationRows(deckId)).toEqual(before);
  });
});

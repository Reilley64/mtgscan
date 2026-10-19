import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  catalogFixtureManifest,
  catalogFixtureSnapshotAt,
  resetCardCatalog,
  runCatalogImport,
} from './catalog-import-command';
import { deckOf } from './deck-calls';
import {
  deckWithCards,
  emptyDeck,
  scannedCopy,
  setCatalogSnapshotAt,
  storedEvaluation,
  storedEvaluations,
  withFailingRecompute,
} from './deck-evaluation-seeds';
import {
  anonymousClient,
  asDatabaseOwner,
  asDatabaseRole,
  asSignedInUser,
  secretKeyClient,
  signUpNewUser,
  type TestUser,
} from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';
const laterSnapshotAt = '2026-10-15T21:01:56.786+00:00';

let alice: TestUser;
let bob: TestUser;

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
  [alice, bob] = await Promise.all([signUpNewUser(), signUpNewUser()]);
});

async function recomputed() {
  const { data, error } = await secretKeyClient().rpc('recompute_deck_evaluations');
  expect(error).toBeNull();
  return data;
}

function asRole(role: 'deck_evaluator' | 'catalog_importer', statement: string) {
  return asDatabaseRole(role, {}, (transaction) => transaction.unsafe(statement));
}

async function recomputeWaitsForALock() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const [waiting] = await asDatabaseOwner(
      (database) => database`
        select count(*)::integer as count
        from pg_stat_activity
        where wait_event_type = 'Lock' and query like '%recompute_deck_evaluations%'
      `,
    );
    if (waiting.count > 0) {
      return;
    }
    await Bun.sleep(50);
  }
  throw new Error('The recompute never waited for the deck lock');
}

describe('the recompute', () => {
  test('it judges every deck that has a card again in one transaction and returns the number of decks', async () => {
    const [aliceDeck, bobDeck] = [await deckWithCards(alice), await deckWithCards(bob)];
    const empty = await emptyDeck(alice);
    await setCatalogSnapshotAt(laterSnapshotAt);

    try {
      const count = await recomputed();

      const evaluations = await storedEvaluations();
      const judged = (deckId: string) => evaluations.find((evaluation) => evaluation.deck_id === deckId);
      expect(count).toBe(evaluations.length);
      expect(judged(aliceDeck)!.catalog_at).toEqual(new Date(laterSnapshotAt));
      expect(judged(bobDeck)!.catalog_at).toEqual(new Date(laterSnapshotAt));
      expect(new Set(evaluations.map((evaluation) => evaluation.judged_at.toISOString())).size).toBe(1);
      expect((await deckOf(alice, empty)).evaluation).toBeNull();
      expect((await deckOf(bob, bobDeck)).evaluation).toMatchObject({ revision: 3 });
    } finally {
      await setCatalogSnapshotAt(catalogFixtureSnapshotAt);
      await recomputed();
    }
  });

  test('a failure leaves every deck evaluation as it was', async () => {
    await deckWithCards(alice);
    await deckWithCards(bob);
    await recomputed();
    const before = await storedEvaluations();
    await setCatalogSnapshotAt(laterSnapshotAt);

    try {
      const { error } = await withFailingRecompute(async () => secretKeyClient().rpc('recompute_deck_evaluations'));

      expect(error?.message).toContain('Forced deck evaluation failure');
      expect(await storedEvaluations()).toEqual(before);
    } finally {
      await setCatalogSnapshotAt(catalogFixtureSnapshotAt);
    }
  });

  test('only the secret key can call it', async () => {
    await deckWithCards(alice);
    await recomputed();
    const before = await storedEvaluations();

    for (const client of [alice.client, anonymousClient()]) {
      for (const name of ['recompute_deck_evaluations', 'deck_evaluations_are_behind'] as const) {
        const { error } = await client.rpc(name);
        expect(error?.code).toBe(permissionDenied);
      }
    }
    expect(await storedEvaluations()).toEqual(before);
  });

  test('it waits for a deck change made at the same time and keeps its newer deck evaluation', async () => {
    const deckId = await deckWithCards(alice);
    const copyId = await scannedCopy(alice);
    let recompute: Promise<{ error: unknown }> | undefined;

    await asSignedInUser(alice, async (transaction) => {
      const request = JSON.stringify({ deck_id: deckId, copy_id: copyId, unprotect: false });
      await transaction.unsafe(`select public.add_deck_card('${request}'::jsonb)`);
      recompute = Promise.resolve(secretKeyClient().rpc('recompute_deck_evaluations'));
      await recomputeWaitsForALock();
    });

    expect((await recompute!).error).toBeNull();
    const deck = await deckOf(alice, deckId);
    expect(deck.revision).toBe(4);
    expect(deck.evaluation).toMatchObject({
      revision: 4,
      violations: expect.arrayContaining([expect.objectContaining({ rule: 'deck_size', message: '101 of 100 cards.' })]),
    });
    expect((await storedEvaluation(deckId))!.revision).toBe(4);
  });

  test('its role can write only deck evaluations, and the import role still cannot read or write user data', async () => {
    const deckId = await deckWithCards(alice);

    await asRole('deck_evaluator', 'select count(*) from public.deck_evaluations');
    await asRole('deck_evaluator', 'select count(*) from public.decks');
    for (const statement of [
      `update public.decks set name = 'Kinnan' where id = '${deckId}'`,
      `delete from public.deck_cards where deck_id = '${deckId}'`,
      'update public.copies set is_protected = true',
      'select count(*) from public.profiles',
      'update public.cards set name = name',
    ]) {
      await expect(asRole('deck_evaluator', statement)).rejects.toMatchObject({ errno: permissionDenied });
    }
    for (const statement of [
      'select count(*) from public.deck_evaluations',
      'select count(*) from public.decks',
      'select count(*) from public.copies',
      `delete from public.deck_evaluations where deck_id = '${deckId}'`,
    ]) {
      await expect(asRole('catalog_importer', statement)).rejects.toMatchObject({ errno: permissionDenied });
    }
  });
});

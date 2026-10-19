import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { getDeck, listDeckChanges, revertDeckChanges, setDeckCommander } from '../decks';
import { closePlannedSwap, swapInPlannedSwap, swapInPlannedSwaps } from '../planned-swaps';
import { connectedAiClient, type ClaimedAiClient } from './ai-clients';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { call, refused, replyOf } from './database-calls';
import { signUpNewUser, type TestUser } from './local-stack';
import {
  copyOf,
  counterspell,
  deckNamed,
  krenko,
  krenkoDeck,
  lightningBolt,
  onePlannedSwap,
  plannedSwapNamed,
  reason,
  revisionOf,
  scannedCopy,
} from './planned-swap-seeds';

setDefaultTimeout(60_000);

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

function swapInAll(user: TestUser, deckId: string, plannedSwapIds: string[]) {
  return call(user.client, swapInPlannedSwaps, { deck_id: deckId, planned_swap_ids: plannedSwapIds });
}

async function changesOf(user: TestUser, deckId: string) {
  return (await replyOf(user.client, listDeckChanges, { deck_id: deckId })).items;
}

describe('swap_in_planned_swaps', () => {
  test('swaps in the planned swaps oldest first, each in its own swapped_in deck change with its reason', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const newBolt = await scannedCopy(client.user, lightningBolt);
    const counter = await scannedCopy(client.user, counterspell);
    const older = await onePlannedSwap(client, deckId, newBolt, { outgoing: { copy_id: bolt } });
    const newer = await onePlannedSwap(client, deckId, counter, { reason: 'Counterspell stops the board wipe that beats Krenko.' });
    const revision = await revisionOf(client.user, deckId);

    expect(await swapInAll(client.user, deckId, [newer, older])).toEqual({
      status: 'replied',
      reply: { deck_id: deckId, revision: revision + 2, swapped_in: [older, newer], closed: [] },
    });
    const [second, first] = await changesOf(client.user, deckId);
    expect(first).toMatchObject({ revision: revision + 1, kind: 'swapped_in', reason });
    expect(first!.lines.map((line) => line.kind === 'copy' && [line.copy_id, line.place_before, line.place_after]).toSorted()).toEqual(
      [
        [newBolt, null, 'main'],
        [bolt, 'main', null],
      ].toSorted(),
    );
    expect(second).toMatchObject({
      revision: revision + 2,
      kind: 'swapped_in',
      reason: 'Counterspell stops the board wipe that beats Krenko.',
    });
    expect(second!.lines.map((line) => line.kind === 'copy' && [line.copy_id, line.place_before, line.place_after])).toEqual([
      [counter, null, 'main'],
    ]);
  });

  test('skips a planned swap that an earlier one in the call closed, because its outgoing card left the deck', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const first = await onePlannedSwap(client, deckId, await scannedCopy(client.user, lightningBolt), { outgoing: { copy_id: bolt } });
    const second = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell), { outgoing: { copy_id: bolt } });
    const revision = await revisionOf(client.user, deckId);

    expect(await swapInAll(client.user, deckId, [first, second])).toEqual({
      status: 'replied',
      reply: { deck_id: deckId, revision: revision + 1, swapped_in: [first], closed: [second] },
    });
    expect(await plannedSwapNamed(client.user, second)).toMatchObject({ status: 'closed', close_note: 'outgoing_left_deck' });
    expect((await changesOf(client.user, deckId)).filter((change) => change.kind === 'swapped_in')).toHaveLength(1);
  });

  test('when a swap in would make a third commander, nothing is swapped in, and the error names that planned swap', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    await replyOf(client.user.client, setDeckCommander, { copy_id: bolt, commander: true });
    const counter = await scannedCopy(client.user, counterspell);
    const older = await onePlannedSwap(client, deckId, counter);
    const held = await scannedCopy(client.user, krenko);
    const newer = await onePlannedSwap(client, deckId, held, { incoming: { copy_id: held, as_commander: true } });
    const revision = await revisionOf(client.user, deckId);

    expect(await swapInAll(client.user, deckId, [newer, older])).toMatchObject(refused('commander_limit', 'planned_swap_ids[0]'));
    expect(await revisionOf(client.user, deckId)).toBe(revision);
    expect((await plannedSwapNamed(client.user, older)).status).toBe('open');
    expect((await plannedSwapNamed(client.user, newer)).status).toBe('open');
    expect(await copyOf(client.user, counter)).toMatchObject({ deck: null });
  });

  test('reverting the first deck change of the call undoes every swap in of the call', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const before = await replyOf(client.user.client, getDeck, { deck_id: deckId });
    const newBolt = await scannedCopy(client.user, lightningBolt);
    const counter = await scannedCopy(client.user, counterspell);
    const plannedSwapIds = [
      await onePlannedSwap(client, deckId, newBolt, { outgoing: { copy_id: bolt } }),
      await onePlannedSwap(client, deckId, counter),
    ];
    const { revision } = await replyOf(client.user.client, swapInPlannedSwaps, { deck_id: deckId, planned_swap_ids: plannedSwapIds });
    const first = (await changesOf(client.user, deckId)).find((change) => change.revision === before.revision + 1)!;

    await replyOf(client.user.client, revertDeckChanges, {
      deck_id: deckId,
      deck_change_id: first.deck_change_id,
      expected_revision: revision,
      unprotect: false,
    });

    const after = await replyOf(client.user.client, getDeck, { deck_id: deckId });
    expect(after.cards.map((card) => card.copy_id).toSorted()).toEqual(before.cards.map((card) => card.copy_id).toSorted());
    expect(await copyOf(client.user, newBolt)).toMatchObject({ deck: null });
    expect(await copyOf(client.user, counter)).toMatchObject({ deck: null });
  });
});

describe('refusing swap_in_planned_swaps', () => {
  type Refusal = { code: string; message?: string; field: string };

  async function refusedSwapInAll(name: string, otherId: (client: ClaimedAiClient, deckId: string) => Promise<string>, refusal: Refusal) {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const newBolt = await scannedCopy(client.user, lightningBolt);
    const open = await onePlannedSwap(client, deckId, newBolt, { outgoing: { copy_id: bolt } });
    const other = await otherId(client, deckId);
    const revision = await revisionOf(client.user, deckId);

    expect(await swapInAll(client.user, deckId, [open, other]), name).toMatchObject({ status: 'refused', refusal });
    expect(await revisionOf(client.user, deckId)).toBe(revision);
    expect((await plannedSwapNamed(client.user, open)).status).toBe('open');
    expect(await copyOf(client.user, newBolt)).toMatchObject({ deck: null });
  }

  const notFound = { code: 'not_found', message: 'planned_swap_ids[1] is not one of your planned swaps in this deck.', field: 'planned_swap_ids[1]' };

  test.each<[string, (client: ClaimedAiClient, deckId: string) => Promise<string>, Refusal]>([
    ['an unknown ID', async () => crypto.randomUUID(), notFound],
    [
      "another user's planned swap",
      async () => {
        const stranger = await connectedAiClient();
        return onePlannedSwap(stranger, await deckNamed(stranger.user, 'Goblins'), await scannedCopy(stranger.user, counterspell));
      },
      notFound,
    ],
    [
      'a planned swap of another deck',
      async (client) => onePlannedSwap(client, await deckNamed(client.user, 'Other'), await scannedCopy(client.user, counterspell)),
      notFound,
    ],
    [
      'a closed planned swap',
      async (client, deckId) => {
        const closed = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
        await replyOf(client.user.client, closePlannedSwap, { planned_swap_id: closed });
        return closed;
      },
      { code: 'not_open', message: 'The planned swap is closed. Only an open planned swap can change.', field: 'planned_swap_ids[1]' },
    ],
    [
      'a swapped in planned swap',
      async (client, deckId) => {
        const swapped = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
        await replyOf(client.user.client, swapInPlannedSwap, { planned_swap_id: swapped });
        return swapped;
      },
      { code: 'not_open', message: 'The planned swap is swapped_in. Only an open planned swap can change.', field: 'planned_swap_ids[1]' },
    ],
  ])('%s is refused, and nothing changes', async (name, otherId, refusal) => {
    await refusedSwapInAll(name, otherId, refusal);
  });

  test('takes 1 to 100 planned swap IDs, with no repeats', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const open = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));

    for (const [ids, field] of [
      [[], 'planned_swap_ids'],
      [Array.from({ length: 101 }, () => crypto.randomUUID()), 'planned_swap_ids'],
      [[open, open], 'planned_swap_ids[1]'],
      [[open, 'bolt'], 'planned_swap_ids[1]'],
    ] as const) {
      expect(await swapInAll(client.user, deckId, [...ids])).toMatchObject(refused('invalid_argument', field));
    }
    expect((await plannedSwapNamed(client.user, open)).status).toBe('open');
  });

  test("another user's deck is not_found", async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const open = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    const stranger = await signUpNewUser();

    expect(await swapInAll(stranger, deckId, [open])).toMatchObject(refused('not_found', 'deck_id'));
    expect((await plannedSwapNamed(client.user, open)).status).toBe('open');
  });
});

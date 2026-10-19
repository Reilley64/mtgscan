import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { Deck, DeckChangePage } from '../decks';
import { connectedAiClient, type ClaimedAiClient } from './ai-clients';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { signUpNewUser, type TestUser } from './local-stack';
import {
  appRead,
  appRequest,
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
  return user.client.rpc('swap_in_planned_swaps', { request: { deck_id: deckId, planned_swap_ids: plannedSwapIds } });
}

async function changesOf(user: TestUser, deckId: string) {
  return (await appRead<DeckChangePage>(user, 'list_deck_changes', { deck_id: deckId })).items;
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

    const { data, error } = await swapInAll(client.user, deckId, [newer, older]);

    expect(error).toBeNull();
    expect(data).toEqual({ deck_id: deckId, revision: revision + 2, swapped_in: [older, newer], closed: [] });
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

    const { data, error } = await swapInAll(client.user, deckId, [first, second]);

    expect(error).toBeNull();
    expect(data).toEqual({ deck_id: deckId, revision: revision + 1, swapped_in: [first], closed: [second] });
    expect(await plannedSwapNamed(client.user, second)).toMatchObject({ status: 'closed', close_note: 'outgoing_left_deck' });
    expect((await changesOf(client.user, deckId)).filter((change) => change.kind === 'swapped_in')).toHaveLength(1);
  });

  test('when a swap in would make a third commander, nothing is swapped in, and the error names that planned swap', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    await appRequest(client.user, 'set_deck_commander', { copy_id: bolt, commander: true });
    const counter = await scannedCopy(client.user, counterspell);
    const older = await onePlannedSwap(client, deckId, counter);
    const held = await scannedCopy(client.user, krenko);
    const newer = await onePlannedSwap(client, deckId, held, { incoming: { copy_id: held, as_commander: true } });
    const revision = await revisionOf(client.user, deckId);

    const { error } = await swapInAll(client.user, deckId, [newer, older]);

    expect(error).toMatchObject({ code: 'commander_limit', details: 'planned_swap_ids[0]' });
    expect(await revisionOf(client.user, deckId)).toBe(revision);
    expect((await plannedSwapNamed(client.user, older)).status).toBe('open');
    expect((await plannedSwapNamed(client.user, newer)).status).toBe('open');
    expect(await copyOf(client.user, counter)).toMatchObject({ deck: null });
  });

  test('reverting the first deck change of the call undoes every swap in of the call', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const before = await appRead<Deck>(client.user, 'get_deck', { deck_id: deckId });
    const newBolt = await scannedCopy(client.user, lightningBolt);
    const counter = await scannedCopy(client.user, counterspell);
    const plannedSwapIds = [
      await onePlannedSwap(client, deckId, newBolt, { outgoing: { copy_id: bolt } }),
      await onePlannedSwap(client, deckId, counter),
    ];
    const { data } = await swapInAll(client.user, deckId, plannedSwapIds);
    const first = (await changesOf(client.user, deckId)).find((change) => change.revision === before.revision + 1)!;

    expect(
      (
        await client.user.client.rpc('revert_deck_changes', {
          request: { deck_id: deckId, deck_change_id: first.deck_change_id, expected_revision: (data as { revision: number }).revision, unprotect: false },
        })
      ).error,
    ).toBeNull();

    const after = await appRead<Deck>(client.user, 'get_deck', { deck_id: deckId });
    expect(after.cards.map((card) => card.copy_id).toSorted()).toEqual(before.cards.map((card) => card.copy_id).toSorted());
    expect(await copyOf(client.user, newBolt)).toMatchObject({ deck: null });
    expect(await copyOf(client.user, counter)).toMatchObject({ deck: null });
  });
});

describe('refusing swap_in_planned_swaps', () => {
  type Refused = { code: string; message?: string; details: string };

  async function refusedSwapInAll(name: string, otherId: (client: ClaimedAiClient, deckId: string) => Promise<string>, refused: Refused) {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const newBolt = await scannedCopy(client.user, lightningBolt);
    const open = await onePlannedSwap(client, deckId, newBolt, { outgoing: { copy_id: bolt } });
    const other = await otherId(client, deckId);
    const revision = await revisionOf(client.user, deckId);

    const { error } = await swapInAll(client.user, deckId, [open, other]);

    expect(error, name).toMatchObject(refused);
    expect(await revisionOf(client.user, deckId)).toBe(revision);
    expect((await plannedSwapNamed(client.user, open)).status).toBe('open');
    expect(await copyOf(client.user, newBolt)).toMatchObject({ deck: null });
  }

  const notFound = { code: 'not_found', message: 'planned_swap_ids[1] is not one of your planned swaps in this deck.', details: 'planned_swap_ids[1]' };

  test.each<[string, (client: ClaimedAiClient, deckId: string) => Promise<string>, Refused]>([
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
        await appRequest(client.user, 'close_planned_swap', { planned_swap_id: closed });
        return closed;
      },
      { code: 'not_open', message: 'The planned swap is closed. Only an open planned swap can change.', details: 'planned_swap_ids[1]' },
    ],
    [
      'a swapped in planned swap',
      async (client, deckId) => {
        const swapped = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
        await appRequest(client.user, 'swap_in_planned_swap', { planned_swap_id: swapped });
        return swapped;
      },
      { code: 'not_open', message: 'The planned swap is swapped_in. Only an open planned swap can change.', details: 'planned_swap_ids[1]' },
    ],
  ])('%s is refused, and nothing changes', async (name, otherId, refused) => {
    await refusedSwapInAll(name, otherId, refused);
  });

  test('takes 1 to 100 planned swap IDs, with no repeats', async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const open = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));

    const refusals = [];
    for (const ids of [[], Array.from({ length: 101 }, () => crypto.randomUUID()), [open, open], [open, 'bolt']]) {
      const { error } = await swapInAll(client.user, deckId, ids);
      refusals.push(error && { code: error.code, details: error.details });
    }

    expect(refusals).toEqual([
      { code: 'invalid_argument', details: 'planned_swap_ids' },
      { code: 'invalid_argument', details: 'planned_swap_ids' },
      { code: 'invalid_argument', details: 'planned_swap_ids[1]' },
      { code: 'invalid_argument', details: 'planned_swap_ids[1]' },
    ]);
    expect((await plannedSwapNamed(client.user, open)).status).toBe('open');
  });

  test("another user's deck is not_found", async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const open = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    const stranger = await signUpNewUser();

    expect((await swapInAll(stranger, deckId, [open])).error).toMatchObject({ code: 'not_found', details: 'deck_id' });
    expect((await plannedSwapNamed(client.user, open)).status).toBe('open');
  });
});

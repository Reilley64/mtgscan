import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { DeckChangePage } from '../decks';
import type { ClosedPlannedSwap, PlannedSwap } from '../planned-swaps';
import { aiClientCall, aiClientRefusal, connectedAiClient } from './ai-clients';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';
import {
  addedToDeck,
  appRead,
  appRequest,
  blackLotus,
  copyOf,
  counterspell,
  deckNamed,
  krenko,
  krenkoDeck,
  lightningBolt,
  listed,
  mountain,
  onePlannedSwap,
  revisionOf,
  scannedCopy,
} from './planned-swap-seeds';

setDefaultTimeout(60_000);

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

function closeAsUser(user: TestUser, plannedSwapId: string) {
  return user.client.rpc('close_planned_swap', { request: { planned_swap_id: plannedSwapId } });
}

async function plannedSwapNamed(user: TestUser, plannedSwapId: string): Promise<PlannedSwap> {
  return (await listed(user, { limit: 50 })).items.find((item) => item.planned_swap_id === plannedSwapId)!;
}

async function statusOf(user: TestUser, plannedSwapId: string): Promise<{ status: string; close_note: string | null }> {
  const { status, close_note } = await plannedSwapNamed(user, plannedSwapId);
  return { status, close_note };
}

const open = { status: 'open', close_note: null };
const outgoingLeftDeck = { status: 'closed', close_note: 'outgoing_left_deck' };

describe('close_planned_swap', () => {
  test('the user closes an open planned swap with the note closed_by_user, and its copy is free again', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const held = await scannedCopy(client.user, lightningBolt);
    const plannedSwapId = await onePlannedSwap(client, deckId, held, { outgoing: { copy_id: bolt } });
    const revision = await revisionOf(client.user, deckId);

    const { data, error } = await closeAsUser(client.user, plannedSwapId);

    expect(error).toBeNull();
    expect(data).toEqual({ id: plannedSwapId, changed: true });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject({ status: 'closed', close_note: 'closed_by_user', effect: null });
    expect(await copyOf(client.user, held)).toMatchObject({ free: true, deck: null });
    expect(await revisionOf(client.user, deckId)).toBe(revision);
  });

  test('closing a closed planned swap succeeds and changes nothing', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    await aiClientCall(client, 'mcp_close_planned_swap', { planned_swap_id: plannedSwapId });
    const closed = await plannedSwapNamed(client.user, plannedSwapId);

    const { data, error } = await closeAsUser(client.user, plannedSwapId);

    expect(error).toBeNull();
    expect(data).toEqual({ id: plannedSwapId, changed: false });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toEqual(closed);
  });

  test('a planned swap that was swapped in is refused with not_open', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    await appRequest(client.user, 'swap_in_planned_swap', { planned_swap_id: plannedSwapId });

    expect((await closeAsUser(client.user, plannedSwapId)).error).toMatchObject({
      code: 'not_open',
      message: 'The planned swap is swapped_in. Only an open planned swap can change.',
      details: 'planned_swap_id',
    });
    expect(await statusOf(client.user, plannedSwapId)).toEqual({ status: 'swapped_in', close_note: null });
  });

  test("another user's planned swap is not_found", async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));

    expect((await closeAsUser(await signUpNewUser(), plannedSwapId)).error).toMatchObject({
      code: 'not_found',
      message: 'planned_swap_id is not one of your planned swaps.',
      details: 'planned_swap_id',
    });
    expect(await statusOf(client.user, plannedSwapId)).toEqual(open);
  });
});

describe('mcp_close_planned_swap', () => {
  test('an AI client closes an open planned swap with the note closed_by_ai_client, and its copy is free again', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const held = await scannedCopy(client.user, counterspell);
    const plannedSwapId = await onePlannedSwap(client, deckId, held);

    const result = await aiClientCall<ClosedPlannedSwap>(client, 'mcp_close_planned_swap', { planned_swap_id: plannedSwapId });

    expect(result).toEqual({ id: plannedSwapId, changed: true });
    expect(await statusOf(client.user, plannedSwapId)).toEqual({ status: 'closed', close_note: 'closed_by_ai_client' });
    expect(await copyOf(client.user, held)).toMatchObject({ free: true });
  });

  test('closing a closed planned swap succeeds and changes nothing', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    await closeAsUser(client.user, plannedSwapId);
    const closed = await plannedSwapNamed(client.user, plannedSwapId);

    const result = await aiClientCall<ClosedPlannedSwap>(client, 'mcp_close_planned_swap', { planned_swap_id: plannedSwapId });

    expect(result).toEqual({ id: plannedSwapId, changed: false });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toEqual(closed);
  });

  test('a planned swap that was swapped in is refused with not_open', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    await appRequest(client.user, 'swap_in_planned_swap', { planned_swap_id: plannedSwapId });

    expect(await aiClientRefusal(client, 'mcp_close_planned_swap', { planned_swap_id: plannedSwapId })).toMatchObject({
      code: 'not_open',
      message: 'The planned swap is swapped_in. Only an open planned swap can change.',
      details: 'planned_swap_id',
    });
  });

  test("another user's planned swap is not_found", async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));

    expect(await aiClientRefusal(await connectedAiClient(), 'mcp_close_planned_swap', { planned_swap_id: plannedSwapId })).toMatchObject({
      code: 'not_found',
      details: 'planned_swap_id',
    });
    expect(await statusOf(client.user, plannedSwapId)).toEqual(open);
  });
});

describe('closing when the outgoing card leaves the deck', () => {
  test('removing the outgoing copy closes its planned swap with the note outgoing_left_deck and frees the held copy', async () => {
    const client = await connectedAiClient();
    const { deckId, commander, bolt } = await krenkoDeck(client.user);
    const held = await scannedCopy(client.user, lightningBolt);
    const leaving = await onePlannedSwap(client, deckId, held, { outgoing: { copy_id: bolt } });
    const staying = await onePlannedSwap(client, deckId, await scannedCopy(client.user, krenko), { outgoing: { copy_id: commander } });
    const noOutgoing = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));

    await appRequest(client.user, 'remove_deck_card', { copy_id: bolt });

    expect(await statusOf(client.user, leaving)).toEqual(outgoingLeftDeck);
    expect(await statusOf(client.user, staying)).toEqual(open);
    expect(await statusOf(client.user, noOutgoing)).toEqual(open);
    expect(await copyOf(client.user, held)).toMatchObject({ free: true });
  });

  test('deleting the outgoing copy closes its planned swap', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, lightningBolt), { outgoing: { copy_id: bolt } });

    await appRequest(client.user, 'delete_copy', { copy_id: bolt });

    expect(await statusOf(client.user, plannedSwapId)).toEqual(outgoingLeftDeck);
  });

  test('a revert that takes the outgoing copy out closes its planned swap', async () => {
    const client = await connectedAiClient();
    const { deckId, commander, bolt } = await krenkoDeck(client.user);
    const leaving = await onePlannedSwap(client, deckId, await scannedCopy(client.user, lightningBolt), { outgoing: { copy_id: bolt } });
    const staying = await onePlannedSwap(client, deckId, await scannedCopy(client.user, krenko), { outgoing: { copy_id: commander } });
    const changes = (await appRead<DeckChangePage>(client.user, 'list_deck_changes', { deck_id: deckId })).items;
    const boltAdded = changes.find((change) => change.kind === 'added' && change.lines.some((line) => line.kind === 'copy' && line.copy_id === bolt))!;

    await appRequest(client.user, 'revert_deck_changes', {
      deck_id: deckId,
      deck_change_id: boltAdded.deck_change_id,
      expected_revision: changes[0]!.revision,
      unprotect: false,
    });

    expect(await statusOf(client.user, leaving)).toEqual(outgoingLeftDeck);
    expect(await statusOf(client.user, staying)).toEqual(open);
  });

  test('two open planned swaps with the same outgoing copy both stay open until a swap in takes it out, and then the other closes', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const first = await onePlannedSwap(client, deckId, await scannedCopy(client.user, lightningBolt), { outgoing: { copy_id: bolt } });
    const second = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell), { outgoing: { copy_id: bolt } });
    await addedToDeck(client.user, deckId, await scannedCopy(client.user, blackLotus));
    expect([await statusOf(client.user, first), await statusOf(client.user, second)]).toEqual([open, open]);

    await appRequest(client.user, 'swap_in_planned_swap', { planned_swap_id: first });

    expect(await statusOf(client.user, first)).toEqual({ status: 'swapped_in', close_note: null });
    expect(await statusOf(client.user, second)).toEqual(outgoingLeftDeck);
  });

  test('moving the outgoing commander to the main deck keeps its planned swap open', async () => {
    const client = await connectedAiClient();
    const { deckId, commander } = await krenkoDeck(client.user);
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, krenko), { outgoing: { copy_id: commander } });

    await appRequest(client.user, 'set_deck_commander', { copy_id: commander, commander: false });

    expect(await statusOf(client.user, plannedSwapId)).toEqual(open);
  });

  test.each<[string, (user: TestUser, deck: { deckId: string; commander: string }) => Promise<unknown>]>([
    ['an add', async (user, { deckId }) => addedToDeck(user, deckId, await scannedCopy(user, blackLotus))],
    ['a commander change', (user, { commander }) => appRequest(user, 'set_deck_commander', { copy_id: commander, commander: false })],
    ['a basic land change', (user, { deckId }) => appRequest(user, 'set_basic_lands', { deck_id: deckId, counts: [{ oracle_id: mountain, count: 97 }] })],
  ])('%s closes each open planned swap whose outgoing copy is no longer in the deck', async (_, change) => {
    const client = await connectedAiClient();
    const deck = await krenkoDeck(client.user);
    const plannedSwapId = await onePlannedSwap(client, deck.deckId, await scannedCopy(client.user, lightningBolt), {
      outgoing: { copy_id: deck.bolt },
    });
    await asDatabaseOwner((database) => database`delete from public.deck_cards where copy_id = ${deck.bolt}`);
    expect(await statusOf(client.user, plannedSwapId)).toEqual(open);

    await change(client.user, deck);

    expect(await statusOf(client.user, plannedSwapId)).toEqual(outgoingLeftDeck);
  });
});

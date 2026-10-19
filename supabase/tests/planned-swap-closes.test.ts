import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import { deleteCopy } from '../collection';
import { changeBasicLand, listDeckChanges, removeDeckCard, revertDeckChanges, setDeckCommander } from '../decks';
import { closePlannedSwap, mcpClosePlannedSwap, swapInPlannedSwap } from '../planned-swaps';
import { aiClientCall, aiClientReply, connectedAiClient } from './ai-clients';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import { call, refused, replyOf } from './database-calls';
import { asDatabaseOwner, signUpNewUser, type TestUser } from './local-stack';
import {
  addedToDeck,
  blackLotus,
  copyOf,
  counterspell,
  deckNamed,
  krenko,
  krenkoDeck,
  lightningBolt,
  mountain,
  onePlannedSwap,
  plannedSwapNamed,
  revisionOf,
  scannedCopy,
} from './planned-swap-seeds';

setDefaultTimeout(60_000);

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

function closeAsUser(user: TestUser, plannedSwapId: string) {
  return call(user.client, closePlannedSwap, { planned_swap_id: plannedSwapId });
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

    expect(await closeAsUser(client.user, plannedSwapId)).toEqual({ status: 'replied', reply: { id: plannedSwapId, changed: true } });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject({ status: 'closed', close_note: 'closed_by_user', effect: null });
    expect(await copyOf(client.user, held)).toMatchObject({ free: true, deck: null });
    expect(await revisionOf(client.user, deckId)).toBe(revision);
  });

  test('closing a closed planned swap succeeds and changes nothing', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    await aiClientReply(client, mcpClosePlannedSwap, { planned_swap_id: plannedSwapId });
    const closed = await plannedSwapNamed(client.user, plannedSwapId);

    expect(await closeAsUser(client.user, plannedSwapId)).toEqual({ status: 'replied', reply: { id: plannedSwapId, changed: false } });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toEqual(closed);
  });

  test('a planned swap that was swapped in is refused with not_open', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    await replyOf(client.user.client, swapInPlannedSwap, { planned_swap_id: plannedSwapId });

    expect(await closeAsUser(client.user, plannedSwapId)).toMatchObject({
      status: 'refused',
      refusal: {
        code: 'not_open',
        message: 'The planned swap is swapped_in. Only an open planned swap can change.',
        field: 'planned_swap_id',
      },
    });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject({ status: 'swapped_in', close_note: null });
  });

  test("another user's planned swap is not_found", async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));

    expect(await closeAsUser(await signUpNewUser(), plannedSwapId)).toMatchObject({
      status: 'refused',
      refusal: { code: 'not_found', message: 'planned_swap_id is not one of your planned swaps.', field: 'planned_swap_id' },
    });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject(open);
  });
});

describe('mcp_close_planned_swap', () => {
  test('an AI client closes an open planned swap with the note closed_by_ai_client, and its copy is free again', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const held = await scannedCopy(client.user, counterspell);
    const plannedSwapId = await onePlannedSwap(client, deckId, held);

    const result = await aiClientReply(client, mcpClosePlannedSwap, { planned_swap_id: plannedSwapId });

    expect(result).toEqual({ id: plannedSwapId, changed: true });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject({ status: 'closed', close_note: 'closed_by_ai_client' });
    expect(await copyOf(client.user, held)).toMatchObject({ free: true });
  });

  test('an AI client closes an open planned swap that another AI client made', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));

    const result = await aiClientReply(await connectedAiClient(client.user), mcpClosePlannedSwap, { planned_swap_id: plannedSwapId });

    expect(result).toEqual({ id: plannedSwapId, changed: true });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject({ status: 'closed', close_note: 'closed_by_ai_client' });
  });

  test('closing a closed planned swap succeeds and changes nothing', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    await replyOf(client.user.client, closePlannedSwap, { planned_swap_id: plannedSwapId });
    const closed = await plannedSwapNamed(client.user, plannedSwapId);

    const result = await aiClientReply(client, mcpClosePlannedSwap, { planned_swap_id: plannedSwapId });

    expect(result).toEqual({ id: plannedSwapId, changed: false });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toEqual(closed);
  });

  test('a planned swap that was swapped in is refused with not_open', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));
    await replyOf(client.user.client, swapInPlannedSwap, { planned_swap_id: plannedSwapId });

    expect(await aiClientCall(client, mcpClosePlannedSwap, { planned_swap_id: plannedSwapId })).toMatchObject({
      status: 'refused',
      refusal: {
        code: 'not_open',
        message: 'The planned swap is swapped_in. Only an open planned swap can change.',
        field: 'planned_swap_id',
      },
    });
  });

  test("another user's planned swap is not_found", async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell));

    expect(await aiClientCall(await connectedAiClient(), mcpClosePlannedSwap, { planned_swap_id: plannedSwapId })).toMatchObject(
      refused('not_found', 'planned_swap_id'),
    );
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject(open);
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

    await replyOf(client.user.client, removeDeckCard, { copy_id: bolt });

    expect(await plannedSwapNamed(client.user, leaving)).toMatchObject(outgoingLeftDeck);
    expect(await plannedSwapNamed(client.user, staying)).toMatchObject(open);
    expect(await plannedSwapNamed(client.user, noOutgoing)).toMatchObject(open);
    expect(await copyOf(client.user, held)).toMatchObject({ free: true });
  });

  test('deleting the outgoing copy closes its planned swap', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, lightningBolt), { outgoing: { copy_id: bolt } });

    await replyOf(client.user.client, deleteCopy, { copy_id: bolt });

    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject(outgoingLeftDeck);
  });

  test('a revert that takes the outgoing copy out closes its planned swap', async () => {
    const client = await connectedAiClient();
    const { deckId, commander, bolt } = await krenkoDeck(client.user);
    const leaving = await onePlannedSwap(client, deckId, await scannedCopy(client.user, lightningBolt), { outgoing: { copy_id: bolt } });
    const staying = await onePlannedSwap(client, deckId, await scannedCopy(client.user, krenko), { outgoing: { copy_id: commander } });
    const changes = (await replyOf(client.user.client, listDeckChanges, { deck_id: deckId })).items;
    const boltAdded = changes.find((change) => change.kind === 'added' && change.lines.some((line) => line.kind === 'copy' && line.copy_id === bolt))!;

    await replyOf(client.user.client, revertDeckChanges, {
      deck_id: deckId,
      deck_change_id: boltAdded.deck_change_id,
      expected_revision: changes[0]!.revision,
      unprotect: false,
    });

    expect(await plannedSwapNamed(client.user, leaving)).toMatchObject(outgoingLeftDeck);
    expect(await plannedSwapNamed(client.user, staying)).toMatchObject(open);
  });

  test('two open planned swaps with the same outgoing copy both stay open until a swap in takes it out, and then the other closes', async () => {
    const client = await connectedAiClient();
    const { deckId, bolt } = await krenkoDeck(client.user);
    const first = await onePlannedSwap(client, deckId, await scannedCopy(client.user, lightningBolt), { outgoing: { copy_id: bolt } });
    const second = await onePlannedSwap(client, deckId, await scannedCopy(client.user, counterspell), { outgoing: { copy_id: bolt } });
    await addedToDeck(client.user, deckId, await scannedCopy(client.user, blackLotus));
    expect([await plannedSwapNamed(client.user, first), await plannedSwapNamed(client.user, second)]).toMatchObject([open, open]);

    await replyOf(client.user.client, swapInPlannedSwap, { planned_swap_id: first });

    expect(await plannedSwapNamed(client.user, first)).toMatchObject({ status: 'swapped_in', close_note: null });
    expect(await plannedSwapNamed(client.user, second)).toMatchObject(outgoingLeftDeck);
  });

  test('moving the outgoing commander to the main deck keeps its planned swap open', async () => {
    const client = await connectedAiClient();
    const { deckId, commander } = await krenkoDeck(client.user);
    const plannedSwapId = await onePlannedSwap(client, deckId, await scannedCopy(client.user, krenko), { outgoing: { copy_id: commander } });

    await replyOf(client.user.client, setDeckCommander, { copy_id: commander, commander: false });

    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject(open);
  });

  test.each<[string, (user: TestUser, deck: { deckId: string; commander: string }) => Promise<unknown>]>([
    ['an add', async (user, { deckId }) => addedToDeck(user, deckId, await scannedCopy(user, blackLotus))],
    ['a commander change', (user, { commander }) => replyOf(user.client, setDeckCommander, { copy_id: commander, commander: false })],
    ['a basic land change', (user, { deckId }) => replyOf(user.client, changeBasicLand, { deck_id: deckId, oracle_id: mountain, by: -1 })],
  ])('%s closes each open planned swap whose outgoing copy is no longer in the deck', async (_, change) => {
    const client = await connectedAiClient();
    const deck = await krenkoDeck(client.user);
    const plannedSwapId = await onePlannedSwap(client, deck.deckId, await scannedCopy(client.user, lightningBolt), {
      outgoing: { copy_id: deck.bolt },
    });
    await asDatabaseOwner((database) => database`delete from public.deck_cards where copy_id = ${deck.bolt}`);
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject(open);

    await change(client.user, deck);

    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject(outgoingLeftDeck);
  });
});

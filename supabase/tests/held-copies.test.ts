import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { BuylistPage } from '../buylist';
import type { CollectionCopyRow } from '../collection';
import type { DeckChangePage, RevertPreview } from '../decks';
import type { PlannedSwap } from '../planned-swaps';
import type { SearchPage } from '../search';
import { connectedAiClient, type ClaimedAiClient } from './ai-clients';
import { catalogFixtureManifest, resetCardCatalog, runCatalogImport } from './catalog-import-command';
import type { TestUser } from './local-stack';
import {
  addedToDeck,
  appRead,
  appRequest,
  copyOf,
  counterspell,
  deckNamed,
  krenkoDeck,
  lightningBolt,
  listed,
  onePlannedSwap,
  revisionOf,
  scannedCopy,
} from './planned-swap-seeds';

setDefaultTimeout(60_000);

beforeAll(async () => {
  await resetCardCatalog();
  expect((await runCatalogImport(catalogFixtureManifest)).exitCode).toBe(0);
});

async function plannedSwapNamed(user: TestUser, plannedSwapId: string): Promise<PlannedSwap> {
  return (await listed(user, { limit: 50 })).items.find((item) => item.planned_swap_id === plannedSwapId)!;
}

async function buylistOf(user: TestUser) {
  return (await appRead<BuylistPage>(user, 'list_buylist', { limit: 50 })).items;
}

async function heldCopyRow(user: TestUser, copyId: string) {
  const page = await appRead<SearchPage<CollectionCopyRow>>(user, 'search_collection', { rows: 'copies', limit: 50 });
  return page.items.find((row) => row.copy_id === copyId)!;
}

function deleteCopy(user: TestUser, request: object) {
  return user.client.rpc('delete_copy', { request: request as { copy_id: string } });
}

async function expectMovedToBuylist(client: ClaimedAiClient, swap: PlannedSwap, closeNote: string) {
  expect(await plannedSwapNamed(client.user, swap.planned_swap_id)).toMatchObject({
    status: 'moved_to_buylist',
    close_note: closeNote,
    effect: null,
  });
  const buylist = await buylistOf(client.user);
  expect(buylist).toHaveLength(1);
  expect(buylist[0]).toMatchObject({
    deck_id: swap.deck_id,
    incoming: { kind: 'card', name: swap.incoming.name, type_line: swap.incoming.type_line },
    outgoing: swap.outgoing,
    as_commander: swap.as_commander,
    reason: swap.reason,
    status: 'open',
    close_note: null,
    client_name: 'ChatGPT',
  });
}

describe('held copies in copy details', () => {
  test("a held copy's details name the deck of the planned swap that holds it", async () => {
    const client = await connectedAiClient();
    const { deckId } = await krenkoDeck(client.user);
    const held = await scannedCopy(client.user, counterspell);
    const plannedSwapId = await onePlannedSwap(client, deckId, held);

    const details = await copyOf(client.user, held);

    expect(details).toMatchObject({
      free: false,
      deck: null,
      held_for: { deck_id: deckId, name: 'Krenko', commander_art_crop_uri: expect.stringContaining('https://cards.scryfall.io/art_crop/') },
    });
    await appRequest(client.user, 'close_planned_swap', { planned_swap_id: plannedSwapId });
    expect(await copyOf(client.user, held)).toMatchObject({ free: true, held_for: null });
  });

  test('a held copy row in the collection names the deck of the planned swap that holds it', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const held = await scannedCopy(client.user, counterspell);
    const free = await scannedCopy(client.user, counterspell);
    await onePlannedSwap(client, deckId, held);

    expect(await heldCopyRow(client.user, held)).toMatchObject({ deck: null, held_for: { deck_id: deckId, name: 'Goblins' } });
    expect(await heldCopyRow(client.user, free)).toMatchObject({ deck: null, held_for: null });
  });
});

describe('deleting a held copy', () => {
  test('a delete that does not name the held copy is refused and changes nothing', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const held = await scannedCopy(client.user, counterspell);
    const plannedSwapId = await onePlannedSwap(client, deckId, held);

    expect((await deleteCopy(client.user, { copy_id: held })).error).toMatchObject({
      code: 'copy_held',
      message: 'Counterspell is held by the planned swap for Goblins. Send held_copy_id to move that planned swap to the buylist and delete the copy.',
      details: 'held_copy_id',
    });
    expect(await copyOf(client.user, held)).toMatchObject({ held_for: { deck_id: deckId } });
    expect(await plannedSwapNamed(client.user, plannedSwapId)).toMatchObject({ status: 'open', close_note: null });
    expect(await buylistOf(client.user)).toEqual([]);
  });

  test('a held_copy_id that is not the deleted copy is refused', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const held = await scannedCopy(client.user, counterspell);
    await onePlannedSwap(client, deckId, held);

    expect((await deleteCopy(client.user, { copy_id: held, held_copy_id: crypto.randomUUID() })).error).toMatchObject({
      code: 'invalid_argument',
      message: 'held_copy_id must be the copy_id.',
      details: 'held_copy_id',
    });
    expect(await copyOf(client.user, held)).toMatchObject({ held_for: { deck_id: deckId } });
  });

  test('a delete that names the held copy deletes it and moves its planned swap to the buylist with the note held_copy_deleted', async () => {
    const client = await connectedAiClient();
    const { deckId, commander } = await krenkoDeck(client.user);
    const held = await scannedCopy(client.user, counterspell);
    const plannedSwapId = await onePlannedSwap(client, deckId, held, { outgoing: { copy_id: commander } });
    const swap = await plannedSwapNamed(client.user, plannedSwapId);
    const revision = await revisionOf(client.user, deckId);

    const { error } = await deleteCopy(client.user, { copy_id: held, held_copy_id: held });

    expect(error).toBeNull();
    expect((await client.user.client.rpc('get_copy', { query: { copy_id: held } })).error).toMatchObject({ code: 'not_found' });
    expect(swap.as_commander).toBe(true);
    await expectMovedToBuylist(client, swap, 'held_copy_deleted');
    expect(await revisionOf(client.user, deckId)).toBe(revision);
  });

  test('a held_copy_id on a copy that is no longer held deletes the copy', async () => {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Goblins');
    const held = await scannedCopy(client.user, counterspell);
    await appRequest(client.user, 'close_planned_swap', { planned_swap_id: await onePlannedSwap(client, deckId, held) });

    expect((await deleteCopy(client.user, { copy_id: held, held_copy_id: held })).error).toBeNull();
    expect((await client.user.client.rpc('get_copy', { query: { copy_id: held } })).error).toMatchObject({ code: 'not_found' });
    expect(await buylistOf(client.user)).toEqual([]);
  });
});

describe('reverting a change that needs a held copy', () => {
  async function heldAfterRemoval() {
    const client = await connectedAiClient();
    const deckId = await deckNamed(client.user, 'Izzet');
    const otherDeckId = await deckNamed(client.user, 'Goblins');
    const copy = await scannedCopy(client.user, lightningBolt);
    await addedToDeck(client.user, deckId, copy);
    await appRequest(client.user, 'remove_deck_card', { copy_id: copy });
    const plannedSwapId = await onePlannedSwap(client, otherDeckId, copy);
    const changes = await appRead<DeckChangePage>(client.user, 'list_deck_changes', { deck_id: deckId });
    const removal = changes.items.find((change) => change.kind === 'removed')!;
    return { client, deckId, otherDeckId, copy, plannedSwapId, removal: removal.deck_change_id };
  }

  test('the revert preview lists each held copy that the revert needs, with the deck of its planned swap, and no block', async () => {
    const { client, deckId, otherDeckId, copy, removal } = await heldAfterRemoval();

    const preview = await appRead<RevertPreview>(client.user, 'preview_revert', { deck_id: deckId, deck_change_id: removal });

    expect(preview.held_copies).toEqual([{ copy_id: copy, name: 'Lightning Bolt', deck: { deck_id: otherDeckId, name: 'Goblins' } }]);
    expect(preview.blocks).toEqual([]);
    expect(preview.protected_copies).toEqual([]);
  });

  test('the revert moves the planned swap of each held copy to the buylist with the note held_copy_reverted', async () => {
    const { client, deckId, copy, plannedSwapId, removal } = await heldAfterRemoval();
    const swap = await plannedSwapNamed(client.user, plannedSwapId);
    const { revision } = await appRead<RevertPreview>(client.user, 'preview_revert', { deck_id: deckId, deck_change_id: removal });

    await appRequest(client.user, 'revert_deck_changes', {
      deck_id: deckId,
      deck_change_id: removal,
      expected_revision: revision,
      unprotect: false,
    });

    expect(await copyOf(client.user, copy)).toMatchObject({ deck: { deck_id: deckId }, held_for: null });
    await expectMovedToBuylist(client, swap, 'held_copy_reverted');
  });
});

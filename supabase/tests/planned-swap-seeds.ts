import { expect } from 'bun:test';

import type { CopyDetails } from '../collection';
import type { Json } from '../database.types';
import type { AddedDeckCard, CreatedDeck, Deck } from '../decks';
import type { CreatedPlannedSwaps, PlannedSwapInput, PlannedSwapPage, PlannedSwapsQuery } from '../planned-swaps';
import { aiClientCall, type ClaimedAiClient } from './ai-clients';
import { basicLand } from './catalog-import-command';
import type { TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

export const krenko = 'aa078518-0ce2-4c6f-9061-aa7e22ed7493';
export const lightningBolt = '132dc07f-74e2-4bd7-bdb1-4f5d5253c7f2';
export const counterspell = '0df55e3f-14de-46ef-b6b1-616618724d9e';
export const blackLotus = 'b0faa7f2-b547-42c4-a810-839da50dadfe';
export const mountain = basicLand('Mountain').oracle_id;
export const reason = 'Cheap removal that also answers an early threat.';

export type KrenkoDeck = { deckId: string; commander: string; bolt: string };

export async function appRequest<T>(user: TestUser, name: string, request: object): Promise<T> {
  const { data, error } = await user.client.rpc(name as 'create_deck', { request: request as Json });
  expect(error).toBeNull();
  return data as T;
}

export async function appRead<T>(user: TestUser, name: string, query: object): Promise<T> {
  const { data, error } = await user.client.rpc(name as 'get_deck', { query: query as Json });
  expect(error).toBeNull();
  return data as T;
}

export async function scannedCopies(user: TestUser, cardPrintingId: string, copies = 1): Promise<string[]> {
  const scanned = stack(cardPrintingId, { copies });
  await committed(user, scanBatch([scanned]));
  return scanned.copy_ids;
}

export async function scannedCopy(user: TestUser, cardPrintingId: string): Promise<string> {
  const [copyId] = await scannedCopies(user, cardPrintingId);
  return copyId!;
}

export async function deckNamed(user: TestUser, name: string): Promise<string> {
  return (await appRequest<CreatedDeck>(user, 'create_deck', { name })).deck_id;
}

export function addedToDeck(user: TestUser, deckId: string, copyId: string) {
  return appRequest<AddedDeckCard>(user, 'add_deck_card', { deck_id: deckId, copy_id: copyId, unprotect: false });
}

export async function krenkoDeck(user: TestUser, name = 'Krenko'): Promise<KrenkoDeck> {
  const deckId = await deckNamed(user, name);
  const commander = await scannedCopy(user, krenko);
  const bolt = await scannedCopy(user, lightningBolt);
  await addedToDeck(user, deckId, commander);
  await appRequest(user, 'set_deck_commander', { copy_id: commander, commander: true });
  await addedToDeck(user, deckId, bolt);
  await appRequest(user, 'set_basic_lands', { deck_id: deckId, counts: [{ oracle_id: mountain, count: 98 }] });
  return { deckId, commander, bolt };
}

export async function revisionOf(user: TestUser, deckId: string): Promise<number> {
  return (await appRead<Deck>(user, 'get_deck', { deck_id: deckId })).revision;
}

export async function plannedSwapItem(
  user: TestUser,
  deckId: string,
  incomingCopyId: string,
  changes: Partial<PlannedSwapInput> = {},
): Promise<PlannedSwapInput> {
  return {
    ref: crypto.randomUUID().slice(0, 8),
    deck_id: deckId,
    expected_deck_revision: await revisionOf(user, deckId),
    incoming: { copy_id: incomingCopyId },
    reason,
    ...changes,
  };
}

export function planned(client: ClaimedAiClient, plannedSwaps: PlannedSwapInput[], idempotencyKey: string = crypto.randomUUID()) {
  return aiClientCall<CreatedPlannedSwaps>(client, 'create_planned_swaps', { idempotency_key: idempotencyKey, planned_swaps: plannedSwaps });
}

export function listed(user: TestUser, query: PlannedSwapsQuery = {}) {
  return appRead<PlannedSwapPage>(user, 'list_planned_swaps', query);
}

export async function plannedSwapIds(user: TestUser) {
  return (await listed(user, { limit: 50 })).items.map((item) => item.planned_swap_id);
}

export function copyOf(user: TestUser, copyId: string) {
  return appRead<CopyDetails>(user, 'get_copy', { copy_id: copyId });
}

export async function onePlannedSwap(client: ClaimedAiClient, deckId: string, held: string, changes: Partial<PlannedSwapInput> = {}) {
  const { planned_swaps } = await planned(client, [await plannedSwapItem(client.user, deckId, held, changes)]);
  return planned_swaps[0]!.planned_swap_id;
}

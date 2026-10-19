import { getCopy } from '../collection';
import { addDeckCard, changeBasicLand, createDeck, getDeck, setDeckCommander } from '../decks';
import { createPlannedSwaps, listPlannedSwaps, type PlannedSwap, type PlannedSwapInput, type PlannedSwapsQuery } from '../planned-swaps';
import { aiClientReply, type ClaimedAiClient } from './ai-clients';
import { basicLand } from './catalog-import-command';
import { replyOf } from './database-calls';
import { asDatabaseOwner, type TestUser } from './local-stack';
import { committed, scanBatch, stack } from './scan-batches';

export const krenko = 'aa078518-0ce2-4c6f-9061-aa7e22ed7493';
export const lightningBolt = '132dc07f-74e2-4bd7-bdb1-4f5d5253c7f2';
export const counterspell = '0df55e3f-14de-46ef-b6b1-616618724d9e';
export const blackLotus = 'b0faa7f2-b547-42c4-a810-839da50dadfe';
export const mountain = basicLand('Mountain').oracle_id;
export const reason = 'Cheap removal that also answers an early threat.';

export type KrenkoDeck = { deckId: string; commander: string; bolt: string };

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
  return (await replyOf(user.client, createDeck, { name })).deck_id;
}

export function addedToDeck(user: TestUser, deckId: string, copyId: string) {
  return replyOf(user.client, addDeckCard, { deck_id: deckId, copy_id: copyId, unprotect: false });
}

export async function krenkoDeck(user: TestUser, name = 'Krenko'): Promise<KrenkoDeck> {
  const deckId = await deckNamed(user, name);
  const commander = await scannedCopy(user, krenko);
  const bolt = await scannedCopy(user, lightningBolt);
  await addedToDeck(user, deckId, commander);
  await replyOf(user.client, setDeckCommander, { copy_id: commander, commander: true });
  await addedToDeck(user, deckId, bolt);
  await replyOf(user.client, changeBasicLand, { deck_id: deckId, oracle_id: mountain, by: 98 });
  return { deckId, commander, bolt };
}

export async function revisionOf(user: TestUser, deckId: string): Promise<number> {
  return (await replyOf(user.client, getDeck, { deck_id: deckId })).revision;
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
  return aiClientReply(client, createPlannedSwaps, { idempotency_key: idempotencyKey, planned_swaps: plannedSwaps });
}

export function listed(user: TestUser, query: PlannedSwapsQuery = {}) {
  return replyOf(user.client, listPlannedSwaps, query);
}

export async function plannedSwapNamed(user: TestUser, plannedSwapId: string): Promise<PlannedSwap> {
  return (await listed(user, { limit: 50 })).items.find((item) => item.planned_swap_id === plannedSwapId)!;
}

export async function plannedSwapIds(user: TestUser) {
  return (await listed(user, { limit: 50 })).items.map((item) => item.planned_swap_id);
}

export function copyOf(user: TestUser, copyId: string) {
  return replyOf(user.client, getCopy, { copy_id: copyId });
}

export async function onePlannedSwap(client: ClaimedAiClient, deckId: string, held: string, changes: Partial<PlannedSwapInput> = {}) {
  const { planned_swaps } = await planned(client, [await plannedSwapItem(client.user, deckId, held, changes)]);
  return planned_swaps[0]!.planned_swap_id;
}

export function codesOf(warnings: { code: string }[]) {
  return warnings.map((warning) => warning.code);
}

export async function twoItems<Item>(itemOf: (index: number) => Promise<Item>, changeSecond: (item: Item) => Item | Promise<Item>) {
  return [await itemOf(0), await changeSecond(await itemOf(1))];
}

export function backdated(table: 'planned_swaps' | 'buylist_cards', id: string, ago: string) {
  return asDatabaseOwner((database) =>
    database.begin(async (transaction) => {
      await transaction`set local session_replication_role = replica`;
      await transaction`
        update ${transaction(`public.${table}`)} set created_at = now() - ${ago}::interval, status_changed_at = now() - ${ago}::interval
        where id = ${id}
      `;
    }),
  );
}

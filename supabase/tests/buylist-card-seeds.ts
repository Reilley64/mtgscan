import type { BuylistCardInput, BuylistPage, BuylistQuery, CreatedBuylistCards } from '../buylist';
import { aiClientCall, type ClaimedAiClient } from './ai-clients';
import type { TestUser } from './local-stack';
import { appRead, reason, revisionOf } from './planned-swap-seeds';

export async function buylistCardItem(
  user: TestUser,
  deckId: string,
  oracleId: string,
  changes: Partial<BuylistCardInput> = {},
): Promise<BuylistCardInput> {
  return {
    ref: crypto.randomUUID().slice(0, 8),
    deck_id: deckId,
    expected_deck_revision: await revisionOf(user, deckId),
    incoming: { oracle_id: oracleId },
    reason,
    ...changes,
  };
}

export function addedToBuylist(client: ClaimedAiClient, buylistCards: BuylistCardInput[], idempotencyKey: string = crypto.randomUUID()) {
  return aiClientCall<CreatedBuylistCards>(client, 'create_buylist_cards', { idempotency_key: idempotencyKey, buylist_cards: buylistCards });
}

export function listedBuylist(user: TestUser, query: BuylistQuery = {}) {
  return appRead<BuylistPage>(user, 'list_buylist', query);
}

export async function oneBuylistCard(client: ClaimedAiClient, deckId: string, oracleId: string, changes: Partial<BuylistCardInput> = {}) {
  const { buylist_cards } = await addedToBuylist(client, [await buylistCardItem(client.user, deckId, oracleId, changes)]);
  return buylist_cards[0]!.buylist_card_id;
}

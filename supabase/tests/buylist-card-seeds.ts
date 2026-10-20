import { createBuylistCards, listBuylist, type BuylistCardInput, type BuylistQuery } from '../buylist';
import { aiClientReply, type ClaimedAiClient } from './ai-clients';
import { replyOf } from './database-calls';
import type { TestUser } from './local-stack';
import { reason, revisionOf } from './planned-swap-seeds';

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
  return aiClientReply(client, createBuylistCards, { idempotency_key: idempotencyKey, buylist_cards: buylistCards });
}

export function listedBuylist(user: TestUser, query: BuylistQuery = {}) {
  return replyOf(user.client, listBuylist, query);
}

export async function oneBuylistCard(client: ClaimedAiClient, deckId: string, oracleId: string, changes: Partial<BuylistCardInput> = {}) {
  const { buylist_cards } = await addedToBuylist(client, [await buylistCardItem(client.user, deckId, oracleId, changes)]);
  return buylist_cards[0]!.buylist_card_id;
}

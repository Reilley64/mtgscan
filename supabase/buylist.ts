import { z } from 'zod';

import { collectionCopyRow } from './collection.ts';
import { databaseFunction } from './database-function.ts';
import { deckRevision } from './decks.ts';
import { buylistCardStatus, deckPriority, id, nextCursor } from './fields.ts';
import { closedPlan, planInput, plannedFields, planQuery, planWarning } from './planned-swaps.ts';

const plannedCardLine = z.strictObject({
  kind: z.literal('card'),
  oracle_id: id,
  name: z.string(),
  image_uris: z.array(z.string()),
  type_line: z.string(),
});

export type PlannedCardLine = z.infer<typeof plannedCardLine>;

const buylistCard = z.strictObject({
  buylist_card_id: id,
  ...plannedFields,
  incoming: plannedCardLine,
  status: buylistCardStatus,
});

export type BuylistCard = z.infer<typeof buylistCard>;

const buylistQuery = z.strictObject({ ...planQuery, status: buylistCardStatus.optional() });

export type BuylistQuery = z.input<typeof buylistQuery>;

const buylistPage = z.strictObject({ items: z.array(buylistCard), next_cursor: nextCursor });

export type BuylistPage = z.infer<typeof buylistPage>;

const buylistCardInput = z.strictObject({
  ...planInput,
  incoming: z.strictObject({ oracle_id: id, as_commander: z.boolean().optional() }),
});

export type BuylistCardInput = z.input<typeof buylistCardInput>;

const buylistCardWarning = z.union([
  ...planWarning,
  z.strictObject({ code: z.literal('protected_only') }),
  z.strictObject({
    code: z.literal('in_other_decks'),
    decks: z.array(z.strictObject({ deck_id: id, name: z.string(), priority: deckPriority })),
  }),
]);

const createdBuylistCards = z.strictObject({
  buylist_cards: z.array(z.strictObject({ ref: z.string(), buylist_card_id: id, warnings: z.array(buylistCardWarning) })),
  replayed: z.boolean(),
});

export type CreatedBuylistCards = z.infer<typeof createdBuylistCards>;

const markBuylistCardBoughtRequest = z.strictObject({ buylist_card_id: id, copy_id: id, unprotect: z.boolean() });

export type MarkBuylistCardBoughtRequest = z.input<typeof markBuylistCardBoughtRequest>;

const closeBuylistCardRequest = z.strictObject({ buylist_card_id: id });

export type CloseBuylistCardRequest = z.input<typeof closeBuylistCardRequest>;

export type ClosedBuylistCard = z.infer<typeof closedPlan>;

const freeCopiesQuery = z.strictObject({ oracle_id: id });

export type FreeCopiesQuery = z.input<typeof freeCopiesQuery>;

const freeCopy = collectionCopyRow.omit({ deck: true, held_for: true, created_at: true, oracle_text: true });

export type FreeCopy = z.infer<typeof freeCopy>;

const freeCopies = z.strictObject({ items: z.array(freeCopy) });

export const listBuylist = databaseFunction({
  name: 'list_buylist',
  argument: 'query',
  request: buylistQuery.optional(),
  reply: buylistPage,
  errorCodes: ['invalid_argument', 'invalid_cursor', 'not_found'],
});

export const createBuylistCards = databaseFunction({
  name: 'create_buylist_cards',
  argument: 'request',
  request: z.strictObject({ idempotency_key: z.string(), buylist_cards: z.array(buylistCardInput) }),
  reply: createdBuylistCards,
  errorCodes: [
    'invalid_argument',
    'idempotency_conflict',
    'not_found',
    'stale_revision',
    'invalid_card',
    'free_copy_exists',
    'outgoing_not_in_deck',
    'duplicate_open',
  ],
});

export const markBuylistCardBought = databaseFunction({
  name: 'mark_buylist_card_bought',
  argument: 'request',
  request: markBuylistCardBoughtRequest,
  reply: deckRevision,
  errorCodes: ['invalid_argument', 'not_found', 'not_open', 'copy_not_free', 'copy_protected', 'commander_limit'],
});

export const closeBuylistCard = databaseFunction({
  name: 'close_buylist_card',
  argument: 'request',
  request: closeBuylistCardRequest,
  reply: closedPlan,
  errorCodes: ['invalid_argument', 'not_found', 'not_open'],
});

export const mcpCloseBuylistCard = databaseFunction({
  name: 'mcp_close_buylist_card',
  argument: 'request',
  request: closeBuylistCardRequest,
  reply: closedPlan,
  errorCodes: ['invalid_argument', 'not_found', 'not_open'],
});

export const listFreeCopies = databaseFunction({
  name: 'list_free_copies',
  argument: 'query',
  request: freeCopiesQuery,
  reply: freeCopies,
  errorCodes: ['invalid_argument'],
});

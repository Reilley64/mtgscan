import { z } from 'zod';

import { databaseFunction } from './database-function.ts';
import type { Database } from './database.types.ts';
import { deckChangeEffect, deckRevision } from './decks.ts';
import { closeNote, condition, finish, id, integer, nextCursor, plannedSwapStatus } from './fields.ts';

export type CloseNote = Database['public']['Enums']['close_note'];

const plannedCopyLine = z.strictObject({
  kind: z.literal('copy'),
  copy_id: id,
  name: z.string(),
  image_uris: z.array(z.string()),
  type_line: z.string(),
  set: z.string().nullable(),
  collector_number: z.string().nullable(),
  finish: finish.nullable(),
  condition: condition.nullable(),
});

export type PlannedCopyLine = z.infer<typeof plannedCopyLine>;

const plannedBasicLandLine = z.strictObject({ kind: z.literal('basic_land'), oracle_id: id, name: z.string(), image_uris: z.array(z.string()) });

export type PlannedBasicLandLine = z.infer<typeof plannedBasicLandLine>;

export const plannedOutgoingLine = z.discriminatedUnion('kind', [plannedCopyLine, plannedBasicLandLine]);

export type PlannedOutgoingLine = z.infer<typeof plannedOutgoingLine>;

export const plannedFields = {
  deck_id: id,
  deck_name: z.string(),
  commander_art_crop_uri: z.string().nullable(),
  outgoing: plannedOutgoingLine.nullable(),
  as_commander: z.boolean(),
  reason: z.string(),
  close_note: closeNote.nullable(),
  created_at: z.string(),
  status_changed_at: z.string(),
  effect: deckChangeEffect.nullable(),
};

const plannedSwap = z.strictObject({
  planned_swap_id: id,
  ...plannedFields,
  incoming: plannedOutgoingLine,
  status: plannedSwapStatus,
});

export type PlannedSwap = z.infer<typeof plannedSwap>;

export const planQuery = {
  deck_id: id.optional(),
  order: z.enum(['newest_first', 'oldest_first']).optional(),
  cursor: z.string().nullable().optional(),
  limit: integer.optional(),
};

const plannedSwapsQuery = z.strictObject({ ...planQuery, status: plannedSwapStatus.optional() });

export type PlannedSwapsQuery = z.input<typeof plannedSwapsQuery>;

const plannedSwapPage = z.strictObject({ items: z.array(plannedSwap), next_cursor: nextCursor });

export type PlannedSwapPage = z.infer<typeof plannedSwapPage>;

export const plannedOutgoingInput = z.union([z.strictObject({ copy_id: id }), z.strictObject({ basic_land_oracle_id: id })]);

export type PlannedOutgoingInput = z.input<typeof plannedOutgoingInput>;

export const planInput = {
  ref: z.string(),
  deck_id: id,
  expected_deck_revision: integer,
  outgoing: plannedOutgoingInput.optional(),
  reason: z.string(),
};

const plannedSwapInput = z.strictObject({
  ...planInput,
  incoming: z.union([z.strictObject({ copy_id: id, as_commander: z.boolean().optional() }), z.strictObject({ basic_land_oracle_id: id })]),
});

export type PlannedSwapInput = z.input<typeof plannedSwapInput>;

export const planWarning = [
  z.strictObject({ code: z.literal('would_break_validity'), effect: deckChangeEffect }),
  z.strictObject({ code: z.enum(['replaces_commander', 'rules_stale']) }),
] as const;

const createdPlannedSwaps = z.strictObject({
  planned_swaps: z.array(z.strictObject({ ref: z.string(), planned_swap_id: id, warnings: z.array(z.union(planWarning)) })),
  replayed: z.boolean(),
});

export type CreatedPlannedSwaps = z.infer<typeof createdPlannedSwaps>;

const swapInPlannedSwapRequest = z.strictObject({ planned_swap_id: id });

export type SwapInPlannedSwapRequest = z.input<typeof swapInPlannedSwapRequest>;

const swapInPlannedSwapsRequest = z.strictObject({ deck_id: id, planned_swap_ids: z.array(id) });

export type SwapInPlannedSwapsRequest = z.input<typeof swapInPlannedSwapsRequest>;

export type ClosePlannedSwapRequest = SwapInPlannedSwapRequest;

export const closedPlan = z.strictObject({ id, changed: z.boolean() });

export type ClosedPlannedSwap = z.infer<typeof closedPlan>;

export const listPlannedSwaps = databaseFunction({
  name: 'list_planned_swaps',
  argument: 'query',
  request: plannedSwapsQuery.optional(),
  reply: plannedSwapPage,
  errorCodes: ['invalid_argument', 'invalid_cursor', 'not_found'],
});

export const createPlannedSwaps = databaseFunction({
  name: 'create_planned_swaps',
  argument: 'request',
  request: z.strictObject({ idempotency_key: z.string(), planned_swaps: z.array(plannedSwapInput) }),
  reply: createdPlannedSwaps,
  errorCodes: [
    'invalid_argument',
    'idempotency_conflict',
    'not_found',
    'stale_revision',
    'copy_not_free',
    'protected_copy',
    'outgoing_not_in_deck',
    'duplicate_open',
  ],
});

export const swapInPlannedSwap = databaseFunction({
  name: 'swap_in_planned_swap',
  argument: 'request',
  request: swapInPlannedSwapRequest,
  reply: deckRevision,
  errorCodes: ['invalid_argument', 'not_found', 'not_open', 'commander_limit'],
});

export const swapInPlannedSwaps = databaseFunction({
  name: 'swap_in_planned_swaps',
  argument: 'request',
  request: swapInPlannedSwapsRequest,
  reply: deckRevision.extend({ swapped_in: z.array(id), closed: z.array(id) }),
  errorCodes: ['invalid_argument', 'not_found', 'not_open', 'commander_limit'],
});

export const closePlannedSwap = databaseFunction({
  name: 'close_planned_swap',
  argument: 'request',
  request: swapInPlannedSwapRequest,
  reply: closedPlan,
  errorCodes: ['invalid_argument', 'not_found', 'not_open'],
});

export const mcpClosePlannedSwap = databaseFunction({
  name: 'mcp_close_planned_swap',
  argument: 'request',
  request: swapInPlannedSwapRequest,
  reply: closedPlan,
  errorCodes: ['invalid_argument', 'not_found', 'not_open'],
});

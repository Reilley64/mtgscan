import { z } from 'zod';

import { basicLandCard, collectionCopyRow, copyRowDeck } from './collection.ts';
import { databaseFunction } from './database-function.ts';
import type { Database } from './database.types.ts';
import { color, comboBracketTag, deckChangeKind, deckPriority, deckRole, deckValidity, id, integer, nextCursor } from './fields.ts';

export type DeckPriority = Database['public']['Enums']['deck_priority'];

export type DeckRole = Database['public']['Enums']['deck_role'];

export const deckNameLength = 64;

const deckCommander = z.strictObject({ copy_id: id, name: z.string(), art_crop_uri: z.string().nullable() });

export type DeckCommander = z.infer<typeof deckCommander>;

export type DeckValidity = Database['public']['Enums']['deck_validity'];

const deckRule = z.enum(['no_commander', 'commander_eligibility', 'partner', 'deck_size', 'singleton', 'color_identity', 'banned', 'not_legal']);

const undeterminedRule = z.enum([...deckRule.options, 'legality']);

export type UndeterminedRule = z.infer<typeof undeterminedRule>;

const deckEvaluationCopy = z.strictObject({ kind: z.literal('copy'), copy_id: id, name: z.string(), image_uris: z.array(z.string()) });

export type DeckEvaluationCopy = z.infer<typeof deckEvaluationCopy>;

const deckEvaluationCard = z.discriminatedUnion('kind', [
  deckEvaluationCopy,
  z.strictObject({ kind: z.literal('basic_land'), oracle_id: id, name: z.string(), image_uris: z.array(z.string()) }),
]);

export type DeckEvaluationCard = z.infer<typeof deckEvaluationCard>;

const violation = z.strictObject({
  rule: deckRule,
  citation: z.string().nullable(),
  message: z.string(),
  hint: z.string().nullable(),
  cards: z.array(deckEvaluationCard),
  colors: z.array(color).optional(),
});

export type Violation = z.infer<typeof violation>;

const undeterminedCheck = z.strictObject({ rule: undeterminedRule, reason: z.string(), cards: z.array(deckEvaluationCard) });

export type UndeterminedCheck = z.infer<typeof undeterminedCheck>;

const estimatedBracket = z.union([z.literal(2), z.literal(3), z.literal(4)]);

export type EstimatedBracket = z.infer<typeof estimatedBracket>;

const deckCombo = z.strictObject({ cards: z.array(deckEvaluationCard), produced_features: z.array(z.string()), bracket_tag: comboBracketTag });

export type DeckCombo = z.infer<typeof deckCombo>;

const bracketSignalFields = {
  source: z.enum(['official', 'heuristic']),
  count: integer,
  lowest_bracket: estimatedBracket,
  cards: z.array(deckEvaluationCard),
};

const bracketSignal = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.enum(['game_changers', 'mass_land_denial', 'extra_turns']), ...bracketSignalFields }),
  z.strictObject({ kind: z.literal('two_card_combo'), ...bracketSignalFields, combos: z.array(deckCombo) }),
]);

export type BracketSignal = z.infer<typeof bracketSignal>;

export type BracketSignalKind = BracketSignal['kind'];

const deckEvaluationSummary = z.strictObject({
  validity: deckValidity,
  validity_stale: z.boolean(),
  estimated_bracket: estimatedBracket,
  bracket_stale: z.boolean(),
});

export type DeckEvaluationSummary = z.infer<typeof deckEvaluationSummary>;

const deckEvaluation = deckEvaluationSummary.extend({
  violations: z.array(violation),
  undetermined: z.array(undeterminedCheck),
  chosen_color: color.nullable(),
  bracket_signals: z.array(bracketSignal),
  missing_signal_count: integer,
  revision: integer,
  catalog_at: z.string().nullable(),
  oracle_tags_at: z.string().nullable(),
  commander_spellbook_at: z.string().nullable(),
  judged_at: z.string(),
  validity_rules_data_at: z.string().nullable(),
  bracket_rules_data_at: z.string().nullable(),
  no_oracle_tag_data: z.boolean(),
  no_combo_data: z.boolean(),
});

export type DeckEvaluation = z.infer<typeof deckEvaluation>;

const deckFields = {
  deck_id: id,
  name: z.string(),
  priority: deckPriority,
  card_count: integer,
  commanders: z.array(deckCommander),
  last_used_at: z.string(),
  revision: integer,
};

const deckRow = z.strictObject({ ...deckFields, evaluation: deckEvaluationSummary.nullable(), needs_you_count: integer });

export type DeckRow = z.infer<typeof deckRow>;

const deckList = z.strictObject({ items: z.array(deckRow) });

const needsYouCounts = z.strictObject({ total: integer, decks: z.array(z.strictObject({ deck_id: id, count: integer })) });

export type NeedsYouCounts = z.infer<typeof needsYouCounts>;

const deckCard = collectionCopyRow.omit({ deck: true, held_for: true, created_at: true }).extend({
  role: deckRole,
  commander_at: z.string().nullable(),
  added_at: z.string(),
  type_line: z.string(),
  mana_value: z.number(),
  colors: z.array(color),
  planned_out: z.boolean(),
});

export type DeckCard = z.infer<typeof deckCard>;

const deckBasicLand = z.strictObject({ oracle_id: id.nullable(), name: z.string(), image_uris: z.array(z.string()), count: integer });

export type DeckBasicLand = z.infer<typeof deckBasicLand>;

const basicLandCardList = z.strictObject({ items: z.array(basicLandCard) });

const deck = z.strictObject({
  ...deckFields,
  evaluation: deckEvaluation.nullable(),
  created_at: z.string(),
  cards: z.array(deckCard),
  basic_lands: z.array(deckBasicLand),
});

export type Deck = z.infer<typeof deck>;

export type DeckChangeKind = Database['public']['Enums']['deck_change_kind'];

const deckChangesQuery = z.strictObject({ deck_id: id, cursor: z.string().nullable().optional(), limit: integer.optional() });

export type DeckChangesQuery = z.input<typeof deckChangesQuery>;

const deckChangeCopyLine = z.strictObject({
  kind: z.literal('copy'),
  copy_id: id,
  name: z.string(),
  image_uris: z.array(z.string()),
  type_line: z.string(),
  place_before: deckRole.nullable(),
  place_after: deckRole.nullable(),
});

export type DeckChangeCopyLine = z.infer<typeof deckChangeCopyLine>;

const deckChangeBasicLandLine = z.strictObject({
  kind: z.literal('basic_land'),
  oracle_id: id,
  name: z.string(),
  image_uris: z.array(z.string()),
  count_before: integer,
  count_after: integer,
});

export type DeckChangeBasicLandLine = z.infer<typeof deckChangeBasicLandLine>;

const deckChangeLine = z.discriminatedUnion('kind', [deckChangeCopyLine, deckChangeBasicLandLine]);

export type DeckChangeLine = z.infer<typeof deckChangeLine>;

const deckChange = z.strictObject({
  deck_change_id: id,
  revision: integer,
  kind: deckChangeKind,
  changed_at: z.string(),
  reverted: z.boolean(),
  reason: z.string().nullable(),
  lines: z.array(deckChangeLine),
});

export type DeckChange = z.infer<typeof deckChange>;

const deckChangePage = z.strictObject({ items: z.array(deckChange), next_cursor: nextCursor });

export type DeckChangePage = z.infer<typeof deckChangePage>;

const createDeckRequest = z.strictObject({ name: z.string() });

const createdDeck = z.strictObject({ deck_id: id });

export type CreatedDeck = z.infer<typeof createdDeck>;

const deckQuery = z.strictObject({ deck_id: id });

const renameDeckRequest = z.strictObject({ deck_id: id, name: z.string() });

const setDeckPriorityRequest = z.strictObject({ deck_id: id, priority: deckPriority });

const addDeckCardRequest = z.strictObject({ deck_id: id, copy_id: id, unprotect: z.boolean() });

export type AddDeckCardRequest = z.input<typeof addDeckCardRequest>;

export const deckRevision = z.strictObject({ deck_id: id, revision: integer });

const setDeckCommanderRequest = z.strictObject({ copy_id: id, commander: z.boolean() });

const changeBasicLandRequest = z.strictObject({ deck_id: id, oracle_id: id, by: integer });

export type ChangeBasicLandRequest = z.input<typeof changeBasicLandRequest>;

const removeDeckCardRequest = z.strictObject({ copy_id: id });

const revertPreviewQuery = z.strictObject({ deck_id: id, deck_change_id: id });

const revertBlock = z.strictObject({ copy_id: id, name: z.string(), deck: copyRowDeck.nullable() });

export type RevertBlock = z.infer<typeof revertBlock>;

const revertHeldCopy = z.strictObject({ copy_id: id, name: z.string(), deck: copyRowDeck });

export type RevertHeldCopy = z.infer<typeof revertHeldCopy>;

export const deckChangeEffect = z.strictObject({
  kind: z.enum(['would_make_invalid', 'adds_violation']),
  rules: z.array(violation.pick({ rule: true, colors: true })),
});

export type DeckChangeEffect = z.infer<typeof deckChangeEffect>;

export type DeckChangeEffectRule = DeckChangeEffect['rules'][number];

const revertPreview = z.strictObject({
  revision: integer,
  lines: z.array(deckChangeLine),
  blocks: z.array(revertBlock),
  protected_copies: z.array(z.strictObject({ copy_id: id, name: z.string() })),
  held_copies: z.array(revertHeldCopy),
  effect: deckChangeEffect.nullable(),
});

export type RevertPreview = z.infer<typeof revertPreview>;

const addDeckCardPreviewQuery = z.union([
  z.strictObject({ copy_id: id }),
  z.strictObject({ basic_land_oracle_id: id, count: integer }),
]);

export type AddDeckCardPreviewQuery = z.input<typeof addDeckCardPreviewQuery>;

const addDeckCardPreview = z.strictObject({ items: z.array(z.strictObject({ deck_id: id, effect: deckChangeEffect.nullable() })) });

export type AddDeckCardPreview = z.infer<typeof addDeckCardPreview>;

const revertDeckChangesRequest = revertPreviewQuery.extend({ expected_revision: integer, unprotect: z.boolean() });

export type RevertDeckChangesRequest = z.input<typeof revertDeckChangesRequest>;

export const createDeck = databaseFunction({
  name: 'create_deck',
  argument: 'request',
  request: createDeckRequest,
  reply: createdDeck,
  errorCodes: ['invalid_argument'],
});

export const listDecks = databaseFunction({
  name: 'list_decks',
  argument: 'query',
  request: z.strictObject({}).optional(),
  reply: deckList,
  errorCodes: ['invalid_argument'],
});

export const getNeedsYouCounts = databaseFunction({
  name: 'get_needs_you_counts',
  argument: 'query',
  request: z.strictObject({}).optional(),
  reply: needsYouCounts,
  errorCodes: ['invalid_argument'],
});

export const getDeck = databaseFunction({
  name: 'get_deck',
  argument: 'query',
  request: deckQuery,
  reply: deck,
  errorCodes: ['invalid_argument', 'not_found'],
});

export const markDeckUsed = databaseFunction({
  name: 'mark_deck_used',
  argument: 'request',
  request: deckQuery,
  reply: z.null(),
  errorCodes: ['invalid_argument', 'not_found'],
});

export const renameDeck = databaseFunction({
  name: 'rename_deck',
  argument: 'request',
  request: renameDeckRequest,
  reply: z.null(),
  errorCodes: ['invalid_argument', 'not_found'],
});

export const setDeckPriority = databaseFunction({
  name: 'set_deck_priority',
  argument: 'request',
  request: setDeckPriorityRequest,
  reply: z.null(),
  errorCodes: ['invalid_argument', 'not_found'],
});

export const deleteDeck = databaseFunction({
  name: 'delete_deck',
  argument: 'request',
  request: deckQuery,
  reply: z.null(),
  errorCodes: ['invalid_argument', 'not_found'],
});

export const listDeckChanges = databaseFunction({
  name: 'list_deck_changes',
  argument: 'query',
  request: deckChangesQuery,
  reply: deckChangePage,
  errorCodes: ['invalid_argument', 'invalid_cursor', 'not_found'],
});

export const addDeckCard = databaseFunction({
  name: 'add_deck_card',
  argument: 'request',
  request: addDeckCardRequest,
  reply: deckRevision,
  errorCodes: ['invalid_argument', 'not_found', 'copy_not_free', 'protected_copy'],
});

export const setDeckCommander = databaseFunction({
  name: 'set_deck_commander',
  argument: 'request',
  request: setDeckCommanderRequest,
  reply: deckRevision,
  errorCodes: ['invalid_argument', 'not_found', 'copy_not_in_deck', 'commander_limit'],
});

export const changeBasicLand = databaseFunction({
  name: 'change_basic_land',
  argument: 'request',
  request: changeBasicLandRequest,
  reply: deckRevision,
  errorCodes: ['invalid_argument', 'not_found'],
});

export const removeDeckCard = databaseFunction({
  name: 'remove_deck_card',
  argument: 'request',
  request: removeDeckCardRequest,
  reply: deckRevision,
  errorCodes: ['invalid_argument', 'not_found', 'copy_not_in_deck'],
});

export const listBasicLandCards = databaseFunction({
  name: 'list_basic_land_cards',
  argument: null,
  request: z.undefined(),
  reply: basicLandCardList,
  errorCodes: [],
});

export const previewRevert = databaseFunction({
  name: 'preview_revert',
  argument: 'query',
  request: revertPreviewQuery,
  reply: revertPreview,
  errorCodes: ['invalid_argument', 'not_found'],
});

export const previewAddDeckCard = databaseFunction({
  name: 'preview_add_deck_card',
  argument: 'query',
  request: addDeckCardPreviewQuery,
  reply: addDeckCardPreview,
  errorCodes: ['invalid_argument', 'not_found'],
});

export const revertDeckChanges = databaseFunction({
  name: 'revert_deck_changes',
  argument: 'request',
  request: revertDeckChangesRequest,
  reply: deckRevision,
  errorCodes: ['invalid_argument', 'not_found', 'protected_copy', 'stale_revision', 'revert_blocked'],
});

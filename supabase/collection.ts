import { z } from 'zod';

import { databaseFunction } from './database-function.ts';
import type { Database } from './database.types.ts';
import { commanderLegality, condition, deckRole, finish, id, integer, language, rarity } from './fields.ts';
import { catalogFilters, catalogSort, priceFrom, searchPage } from './search.ts';

export type CardCondition = Database['public']['Enums']['card_condition'];

export type CardLanguage = Database['public']['Enums']['card_language'];

const collectionSort = z.enum([...catalogSort.options, 'added']);

export type CollectionSort = z.infer<typeof collectionSort>;

const collectionQuery = z.strictObject({
  ...catalogFilters,
  rows: z.enum(['entries', 'copies']).optional(),
  sort: collectionSort.optional(),
  finishes: z.array(finish).optional(),
  finishes_exclude: z.array(finish).optional(),
  conditions: z.array(condition).optional(),
  conditions_exclude: z.array(condition).optional(),
  languages: z.array(language).optional(),
  languages_exclude: z.array(language).optional(),
  deck_ids: z.array(id).optional(),
  deck_ids_exclude: z.array(id).optional(),
  is_free: z.boolean().optional(),
  is_protected: z.boolean().optional(),
  is_allocated: z.boolean().optional(),
  user_tags: z.array(z.string()).optional(),
  user_tags_exclude: z.array(z.string()).optional(),
});

export type CollectionQuery = z.input<typeof collectionQuery>;

const currentPrice = priceFrom.omit({ basis: true }).extend({ stale: z.boolean() });

export type CurrentPrice = z.infer<typeof currentPrice>;

const collectionRow = z.strictObject({
  oracle_id: id,
  printing_id: id,
  name: z.string(),
  set: z.string(),
  collector_number: z.string(),
  finish,
  language,
  condition,
  protected: z.boolean(),
  quantity: integer,
  free_quantity: integer,
  allocated_quantity: integer,
  held_quantity: integer,
  commander_legal: z.boolean(),
  price: currentPrice.nullable(),
  total: z.string().nullable(),
  oracle_text: z.string().optional(),
});

export type CollectionRow = z.infer<typeof collectionRow>;

export const copyRowDeck = z.strictObject({ deck_id: id, name: z.string() });

export const basicLandCard = z.strictObject({ oracle_id: id, name: z.string(), image_uris: z.array(z.string()) });

export type BasicLandCard = z.infer<typeof basicLandCard>;

export const collectionCopyRow = z.strictObject({
  copy_id: id,
  printing_id: id,
  name: z.string(),
  set: z.string(),
  collector_number: z.string(),
  rarity,
  image_uris: z.array(z.string()),
  finish,
  condition,
  language,
  protected: z.boolean(),
  price: currentPrice.nullable(),
  deck: copyRowDeck.nullable(),
  held_for: copyRowDeck.nullable(),
  created_at: z.string(),
  oracle_text: z.string().optional(),
});

export type CollectionCopyRow = z.infer<typeof collectionCopyRow>;

const collectionPage = z.strictObject({
  ...searchPage,
  total_count: integer.nullable(),
  basic_lands: z.array(basicLandCard).nullable(),
  items: z.array(z.union([collectionRow, collectionCopyRow])),
});

export const collectionEntryPage = collectionPage.extend({ items: z.array(collectionRow) });

export const collectionCopyPage = collectionPage.extend({ items: z.array(collectionCopyRow) });

export type CollectionCopyPage = z.infer<typeof collectionCopyPage>;

const scanBatchStack = z.strictObject({
  card_printing_id: id,
  finish,
  condition,
  language,
  copy_ids: z.array(id),
});

export type ScanBatchStack = z.infer<typeof scanBatchStack>;

const scanBatch = z.strictObject({ items: z.array(scanBatchStack) });

export type ScanBatch = z.input<typeof scanBatch>;

const scanBatchResult = z.strictObject({
  addition_id: id.nullable(),
  added_at: z.string().nullable(),
  copy_count: integer,
  items: z.array(scanBatchStack.omit({ copy_ids: true }).extend({ quantity_added: integer })),
  copies: z.array(z.strictObject({ copy_id: id, addition_id: id, replayed: z.boolean() })),
});

const currentPriceKey = z.strictObject({ printing_id: id, finish });

export type CurrentPriceKey = z.infer<typeof currentPriceKey>;

const currentPricesQuery = z.strictObject({ items: z.array(currentPriceKey) });

export type CurrentPricesQuery = z.input<typeof currentPricesQuery>;

const currentPrices = z.strictObject({ items: z.array(currentPriceKey.extend({ price: currentPrice.nullable() })) });

export type CurrentPriceRow = z.infer<typeof currentPrices>['items'][number];

const copyQuery = z.strictObject({ copy_id: id });

export type CopyQuery = z.input<typeof copyQuery>;

const copyProtectedRequest = z.strictObject({ copy_id: id, protected: z.boolean() });

const deleteCopyRequest = z.strictObject({ copy_id: id, move_planned_swap: z.boolean().optional() });

export const userTagNameLength = 64;

const userTag = z.strictObject({ user_tag_id: id, name: z.string() });

export type UserTag = z.infer<typeof userTag>;

const userTagRow = userTag.extend({ copy_count: integer });

export type UserTagRow = z.infer<typeof userTagRow>;

const userTagList = z.strictObject({ items: z.array(userTagRow) });

const createUserTagRequest = z.strictObject({ name: z.string() });

const renameUserTagRequest = z.strictObject({ user_tag_id: id, name: z.string() });

export type RenameUserTagRequest = z.input<typeof renameUserTagRequest>;

const userTagRequest = z.strictObject({ user_tag_id: id });

export type DeleteUserTagRequest = z.input<typeof userTagRequest>;

const copyUserTagRequest = z.strictObject({ copy_id: id, user_tag_id: id, tagged: z.boolean() });

export type CopyUserTagRequest = z.input<typeof copyUserTagRequest>;

const copiesUserTagRequest = z.strictObject({ copy_ids: z.array(id), user_tag_id: id, tagged: z.boolean() });

const copiesUserTagResult = z.strictObject({
  changed: z.array(id),
  skipped: z.array(z.strictObject({ copy_id: id, reason: z.literal('missing') })),
});

const copyDeck = copyRowDeck.extend({ role: deckRole, commander_art_crop_uri: z.string().nullable(), commander_count: integer });

const copyHeldFor = copyRowDeck.extend({ commander_art_crop_uri: z.string().nullable() });

export type CopyHeldFor = z.infer<typeof copyHeldFor>;

const copyDetails = collectionCopyRow.omit({ created_at: true }).extend({
  art_crop_uri: z.string().nullable(),
  free: z.boolean(),
  added_at: z.string(),
  purchase_day_price: currentPrice.omit({ stale: true }).nullable(),
  type_line: z.string(),
  faces: z.array(z.strictObject({ name: z.string(), oracle_text: z.string() })),
  commander_legality: commanderLegality,
  user_tags: z.array(userTag),
  deck: copyDeck.nullable(),
  held_for: copyHeldFor.nullable(),
});

export type CopyDetails = z.infer<typeof copyDetails>;

const collectionTotal = z.strictObject({
  total: z.string(),
  currency: z.literal('USD'),
  priced_copies: integer,
  copies: integer,
  stale: z.boolean(),
  prices_observed_at: z.string().nullable(),
});

export type CollectionTotal = z.infer<typeof collectionTotal>;

export const searchCollection = databaseFunction({
  name: 'search_collection',
  argument: 'query',
  request: collectionQuery,
  reply: collectionPage,
  errorCodes: ['invalid_argument', 'invalid_cursor', 'data_unavailable'],
});

export const addScanBatch = databaseFunction({
  name: 'add_scan_batch',
  argument: 'batch',
  request: scanBatch,
  reply: scanBatchResult,
  errorCodes: ['invalid_argument', 'unknown_printing', 'basic_land'],
});

export const getCurrentPrices = databaseFunction({
  name: 'get_current_prices',
  argument: 'query',
  request: currentPricesQuery,
  reply: currentPrices,
  errorCodes: ['invalid_argument'],
});

export const getCopy = databaseFunction({
  name: 'get_copy',
  argument: 'query',
  request: copyQuery,
  reply: copyDetails,
  errorCodes: ['invalid_argument', 'not_found'],
});

export const setCopyProtected = databaseFunction({
  name: 'set_copy_protected',
  argument: 'request',
  request: copyProtectedRequest,
  reply: copyProtectedRequest,
  errorCodes: ['invalid_argument', 'not_found', 'copy_not_free'],
});

export const deleteCopy = databaseFunction({
  name: 'delete_copy',
  argument: 'request',
  request: deleteCopyRequest,
  reply: z.null(),
  errorCodes: ['invalid_argument', 'not_found', 'copy_held'],
});

export const getCollectionTotal = databaseFunction({
  name: 'get_collection_total',
  argument: 'query',
  request: z.strictObject({}),
  reply: collectionTotal,
  errorCodes: ['invalid_argument'],
});

export const listUserTags = databaseFunction({
  name: 'list_user_tags',
  argument: 'query',
  request: z.strictObject({ deleted: z.boolean().optional() }).optional(),
  reply: userTagList,
  errorCodes: ['invalid_argument'],
});

export const createUserTag = databaseFunction({
  name: 'create_user_tag',
  argument: 'request',
  request: createUserTagRequest,
  reply: userTag,
  errorCodes: ['invalid_argument', 'user_tag_exists'],
});

export const renameUserTag = databaseFunction({
  name: 'rename_user_tag',
  argument: 'request',
  request: renameUserTagRequest,
  reply: userTag,
  errorCodes: ['invalid_argument', 'not_found', 'user_tag_exists'],
});

export const deleteUserTag = databaseFunction({
  name: 'delete_user_tag',
  argument: 'request',
  request: userTagRequest,
  reply: z.null(),
  errorCodes: ['invalid_argument', 'not_found'],
});

export const setCopyUserTag = databaseFunction({
  name: 'set_copy_user_tag',
  argument: 'request',
  request: copyUserTagRequest,
  reply: z.null(),
  errorCodes: ['invalid_argument', 'not_found'],
});

export const mcpCreateUserTag = databaseFunction({
  name: 'mcp_create_user_tag',
  argument: 'request',
  request: createUserTagRequest,
  reply: userTag.extend({ created: z.boolean() }),
  errorCodes: ['invalid_argument'],
});

export const mcpRenameUserTag = databaseFunction({
  name: 'mcp_rename_user_tag',
  argument: 'request',
  request: renameUserTagRequest,
  reply: userTag,
  errorCodes: ['invalid_argument', 'not_found', 'user_tag_exists'],
});

export const mcpDeleteUserTag = databaseFunction({
  name: 'mcp_delete_user_tag',
  argument: 'request',
  request: userTagRequest,
  reply: z.strictObject({ user_tag_id: id, changed: z.boolean(), copy_count: integer }),
  errorCodes: ['invalid_argument', 'not_found'],
});

export const mcpRestoreUserTag = databaseFunction({
  name: 'mcp_restore_user_tag',
  argument: 'request',
  request: userTagRequest,
  reply: userTag.extend({ changed: z.boolean(), copy_count: integer }),
  errorCodes: ['invalid_argument', 'not_found', 'user_tag_exists'],
});

export const mcpSetCopiesUserTag = databaseFunction({
  name: 'mcp_set_copies_user_tag',
  argument: 'request',
  request: copiesUserTagRequest,
  reply: copiesUserTagResult,
  errorCodes: ['invalid_argument', 'not_found'],
});

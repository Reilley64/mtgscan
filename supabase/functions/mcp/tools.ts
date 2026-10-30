import type { Tool as ListedTool, ToolAnnotations } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { callDatabaseFunction, type DatabaseClient, type DatabaseFunction, type DatabaseFunctionResult } from '../../database-function.ts';
import { databaseFunctions } from '../../database-functions.ts';
import { buylistCardStatus, id, plannedSwapStatus } from '../../fields.ts';
import { plural } from './plural.ts';
import { problem, problemSchema, type Problem, type ProblemCode } from './problems.ts';

type AiClientFunction<Reply extends z.ZodType = z.ZodType> = DatabaseFunction<DatabaseFunction['name'], z.ZodType, Reply, ProblemCode>;

type ToolResult =
  | { status: 'replied'; structuredContent: Record<string, unknown>; summary: string }
  | Exclude<DatabaseFunctionResult<AiClientFunction>, { status: 'replied' }>;

export type Tool = Pick<ListedTool, 'name' | 'inputSchema' | 'outputSchema'> & {
  title: string;
  description: string;
  annotations: ToolAnnotations;
  contract: AiClientFunction;
  input: z.ZodObject;
  tooLargeHint: string;
  call: (supabase: DatabaseClient, toolArguments: Record<string, unknown>) => Promise<ToolResult>;
};

type ToolDefinition<Reply extends z.ZodType> = Omit<Tool, 'inputSchema' | 'outputSchema' | 'call' | 'contract'> & {
  contract: AiClientFunction<Reply>;
  leftOut?: Record<string, string[]>;
  leftOutFields?: string[];
  summary: (reply: z.output<Reply>) => string;
};

const pageSize = { default: 20, max: 50, collectionMax: 100 };

const readOnly: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const destructiveWrite: ToolAnnotations = { ...write, destructiveHint: true };

const usdPrices = 'Prices are current Scryfall prices in USD (TCGplayer Market). There is no other currency.';
const declinedWrite =
  'If the user declines this call, do not call it again. Tell the user that nothing was saved, and ask what they want to change.';
const estimatedBracket =
  'The estimated bracket is an estimate for a pregame conversation, not a certified bracket. Signals labelled heuristic are not official.';

function isImageField(key: string): boolean {
  return key === 'image_uris' || key.endsWith('art_crop_uri');
}

function jsonSchemaOf(schema: z.ZodType): ListedTool['inputSchema'] {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema as ListedTool['inputSchema'];
}

function shown(schema: z.core.$ZodType, isLeftOut: (key: string) => boolean): z.core.$ZodType {
  if (schema instanceof z.ZodObject) {
    return z.object(
      Object.fromEntries(
        Object.entries(schema.shape)
          .filter(([key]) => !isLeftOut(key))
          .map(([key, field]) => [key, shown(field, isLeftOut)]),
      ),
    );
  }
  if (schema instanceof z.ZodArray) {
    return z.array(shown(schema.element, isLeftOut));
  }
  if (schema instanceof z.ZodNullable) {
    return z.nullable(shown(schema.unwrap(), isLeftOut));
  }
  if (schema instanceof z.ZodOptional) {
    return z.optional(shown(schema.unwrap(), isLeftOut));
  }
  if (schema instanceof z.ZodUnion) {
    return z.union(schema.options.map((option) => shown(option, isLeftOut)));
  }
  return schema;
}

function outputOf(reply: z.core.$ZodType, leftOut: Record<string, string[]>, leftOutFields: string[]): z.ZodObject {
  const output = shown(reply, isImageField) as z.ZodObject;
  const kept = Object.entries(output.shape).filter(([field]) => !leftOutFields.includes(field));
  return z.object(Object.fromEntries(kept)).extend(
    Object.fromEntries(Object.entries(leftOut).map(([field, keys]) => [field, shown(output.shape[field]!, (key) => keys.includes(key))])),
  );
}

function defineTool<Reply extends z.ZodType>({ leftOut = {}, leftOutFields = [], summary, ...tool }: ToolDefinition<Reply>): Tool {
  const output = outputOf(tool.contract.reply, leftOut, leftOutFields);
  return {
    ...tool,
    inputSchema: jsonSchemaOf(tool.input),
    outputSchema: { type: 'object', anyOf: [jsonSchemaOf(output), problemSchema] },
    call: async (supabase, toolArguments) => {
      const result = await callDatabaseFunction(supabase, tool.contract, toolArguments);
      return result.status === 'replied'
        ? { status: 'replied', structuredContent: output.parse(result.reply), summary: summary(result.reply) }
        : result;
    },
  };
}

function pageSummary(rows: string, next: string | null): string {
  return `${rows}.${next ? ' More with next_cursor.' : ''}`;
}

function pageOf(max: number) {
  return {
    limit: z.number().int().min(1).max(max).optional().describe(`Rows per page, ${pageSize.default} by default.`),
    cursor: z.string().nullable().optional().describe('The next_cursor of the previous page. Leave it out for the first page.'),
  };
}

const page = pageOf(pageSize.max);
const collectionPage = pageOf(pageSize.collectionMax);
const pageMax = new Map<unknown, number>([
  [page.limit, pageSize.max],
  [collectionPage.limit, pageSize.collectionMax],
]);

export function pagedArguments(
  tool: Tool,
  toolArguments: Record<string, unknown>,
): { toolArguments: Record<string, unknown> } | { problem: Problem } {
  const max = pageMax.get(tool.input.shape.limit);
  if (max === undefined) {
    return { toolArguments };
  }
  if (Number(toolArguments.limit) > max) {
    return { problem: problem('invalid-argument', `limit can be at most ${max} over MCP.`, { pointer: '/limit' }) };
  }
  return { toolArguments: { limit: pageSize.default, ...toolArguments } };
}

const catalogFilters = databaseFunctions.search_catalog.request.shape;

const collectionFilters = databaseFunctions.search_collection.request.shape;

const describedCatalogFilters = {
  text: catalogFilters.text.describe('Words to match in card names, types, and rules text.'),
  identity_subset_of: catalogFilters.identity_subset_of.describe("Only cards whose color identity fits in these colors, such as a deck's color identity."),
  price_min: catalogFilters.price_min.describe('A USD amount, such as "2.50".'),
  price_max: catalogFilters.price_max.describe('A USD amount, such as "2.50".'),
  sets: catalogFilters.sets.describe('Set codes, such as "mh3".'),
  tags: catalogFilters.tags.describe('Oracle tag slugs from search_oracle_tags.'),
};

const basicLandOracleId = id.describe("A basic land card's oracle_id, from basic_lands in get_deck.");

const keyPattern = (minLength: number) => z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${minLength},64}$`));

const plannedSwapInput = z.strictObject({
  ref: keyPattern(1).describe('A name for this planned swap, unique in the call.'),
  deck_id: id.describe("The deck's ID."),
  expected_deck_revision: z.number().int().min(0).describe('The deck revision that get_deck returned.'),
  incoming: z.union([
    z.strictObject({
      copy_id: id.describe('A free copy that the user owns. It must not be protected.'),
      as_commander: z.boolean().optional().describe('Make the incoming copy a commander. Defaults to true when the outgoing copy is a commander.'),
    }),
    z.strictObject({ basic_land_oracle_id: basicLandOracleId.describe('One more of this basic land.') }),
  ]),
  outgoing: z
    .union([
      z.strictObject({ copy_id: id.describe('A copy in the deck.') }),
      z.strictObject({ basic_land_oracle_id: basicLandOracleId.describe('One fewer of this basic land. The deck must have one.') }),
    ])
    .optional(),
  reason: z.string().min(20).max(600),
});

const buylistCardInput = plannedSwapInput.extend({
  ref: keyPattern(1).describe('A name for this buylist card, unique in the call.'),
  incoming: z.strictObject({
    oracle_id: id.describe("The card's oracle_id. It must not be a basic land."),
    as_commander: z.boolean().optional().describe('Make the card a commander. Defaults to true when the outgoing copy is a commander.'),
  }),
});

export const tools = [
  defineTool({
    name: 'search_catalog',
    title: 'Search the card catalog',
    description: [
      'Search the card catalog for cards with text and exact filters. Every filter must match, and an _exclude filter must not.',
      "Each card says how many copies the user owns and how many of them are free. Read a card's rules text with include_oracle_text or get_cards.",
      'Returns only Commander-legal cards. Misspelled names return no results; there is no fuzzy match. Use search_oracle_tags to find tag slugs.',
      usdPrices,
    ].join(' '),
    annotations: readOnly,
    contract: databaseFunctions.search_catalog,
    input: databaseFunctions.search_catalog.request.extend({
      ...describedCatalogFilters,
      sort: catalogFilters.sort.describe('relevance needs text. The default is relevance with text and name without it.'),
      ...page,
    }),
    summary: (result) => pageSummary(plural(result.items.length, 'card', 'cards'), result.next_cursor),
    tooLargeHint: 'Ask for fewer cards with limit, or leave out include_oracle_text.',
  }),
  defineTool({
    name: 'search_collection',
    title: 'Search the collection',
    description: [
      "Search the user's copies with the filters of search_catalog, plus finish, condition, language, deck, user tag, free, protected, and allocated filters.",
      'Each row is one copy with its copy_id, the deck it is in, held_for, the deck of the planned swap that holds it, and created_at, when it was added to the collection.',
      'To count the copies of a card, use the owned quantities of search_catalog or get_cards.',
      'A free copy is not in a deck or held by a planned swap. A protected copy is one the user keeps out of decks.',
      usdPrices,
    ].join(' '),
    annotations: readOnly,
    contract: databaseFunctions.search_collection,
    leftOutFields: ['basic_lands'],
    input: databaseFunctions.search_collection.request.extend({
      ...describedCatalogFilters,
      sort: collectionFilters.sort.describe('The default is relevance with text and added without it.'),
      ...collectionPage,
      deck_ids: collectionFilters.deck_ids.describe('Only copies in these decks.'),
      user_tags: collectionFilters.user_tags.describe('User tag names from list_user_tags.'),
    }),
    summary: (result) => {
      if (result.items.length === 0) {
        return 'Nothing in the collection matches.';
      }
      const rows =
        result.total_count === null
          ? plural(result.items.length, 'copy', 'copies')
          : `${result.items.length} of ${plural(result.total_count, 'copy', 'copies')}`;
      return pageSummary(rows, result.next_cursor);
    },
    tooLargeHint: 'Ask for fewer rows with limit, or leave out include_oracle_text.',
  }),
  defineTool({
    name: 'search_oracle_tags',
    title: 'Find Oracle tags',
    description:
      'Find Oracle tag slugs for a word, such as ramp or removal, with how many Commander-legal cards have each tag. Use the slugs in the tags filter of search_catalog and search_collection.',
    annotations: readOnly,
    contract: databaseFunctions.search_oracle_tags,
    input: z.strictObject({
      text: z.string().describe('A word or phrase that says what cards do.'),
      limit: z.number().int().min(1).max(20).optional().describe('Oracle tags to return, 10 by default.'),
    }),
    summary: (result) => `${plural(result.items.length, 'Oracle tag', 'Oracle tags')}.`,
    tooLargeHint: 'Ask for fewer Oracle tags with limit.',
  }),
  defineTool({
    name: 'get_cards',
    title: 'Get cards',
    description: [
      'Read the full details of up to 20 cards by oracle_ids, or of their card printings by printing_ids: rules text, faces, Commander legality, Oracle tags, combos, and owned copies.',
      'Give oracle_ids or printing_ids, not both.',
      usdPrices,
    ].join(' '),
    annotations: readOnly,
    contract: databaseFunctions.get_cards,
    input: z.strictObject({
      oracle_ids: z.array(id).min(1).max(20).optional(),
      printing_ids: z.array(id).min(1).max(20).optional(),
    }).meta({ oneOf: [{ required: ['oracle_ids'] }, { required: ['printing_ids'] }] }),
    summary: (result) =>
      `${plural(result.items.length, 'card', 'cards')}.${result.not_found.length ? ` ${result.not_found.length} not found.` : ''}`,
    tooLargeHint: 'Ask for fewer cards in one call.',
  }),
  defineTool({
    name: 'list_card_printings',
    title: 'List card printings',
    description: 'List the card printings of one card, newest first, with how many copies of each the user owns.',
    annotations: readOnly,
    contract: databaseFunctions.list_card_printings,
    input: z.strictObject({
      oracle_id: id.describe("The card's oracle_id."),
      owned_only: z.boolean().optional().describe('Only card printings that the user owns.'),
      ...page,
    }),
    summary: (result) => pageSummary(plural(result.items.length, 'card printing', 'card printings'), result.next_cursor),
    tooLargeHint: 'Ask for fewer card printings with limit.',
  }),
  defineTool({
    name: 'list_user_tags',
    title: 'List user tags',
    description: [
      "List the user's user tags with how many copies have each. A user tag goes on individual copies, and it is not an Oracle tag. Search the copies of a user tag with the user_tags filter of search_collection.",
      'With deleted: true, it lists only deleted user tags, with the copies that each would come back on if restored.',
    ].join(' '),
    annotations: readOnly,
    contract: databaseFunctions.list_user_tags,
    input: z.strictObject({
      deleted: z.boolean().optional().describe('true lists only deleted user tags. Without it, only user tags that are not deleted.'),
    }),
    summary: (result) => `${plural(result.items.length, 'user tag', 'user tags')}.`,
    tooLargeHint: 'Search the copies of one user tag with search_collection instead.',
  }),
  defineTool({
    name: 'get_collection_summary',
    title: 'Get the collection summary',
    description: [
      "Read the user's collection total: the sum of the current prices of every copy, with its coverage and whether the prices are stale.",
      'Copies with no current price are left out of the total and counted apart.',
      usdPrices,
    ].join(' '),
    annotations: readOnly,
    contract: databaseFunctions.get_collection_total,
    input: z.strictObject({}),
    summary: (result) => `Collection total ${result.total} USD, ${result.priced_copies} of ${result.copies} copies priced.`,
    tooLargeHint: 'Search the collection with search_collection instead.',
  }),
  defineTool({
    name: 'list_decks',
    title: 'List decks',
    description: [
      "List the user's decks, the most recently used first, with deck priority, deck revision, commanders, card count, deck validity, estimated bracket, and needs_you_count, the number of the deck's open planned swaps and buylist cards.",
      'Read one deck with get_deck.',
      estimatedBracket,
    ].join(' '),
    annotations: readOnly,
    contract: databaseFunctions.list_decks,
    input: z.strictObject({}),
    summary: (result) => `${plural(result.items.length, 'deck', 'decks')}.`,
    tooLargeHint: 'Read one deck at a time with get_deck instead.',
  }),
  defineTool({
    name: 'get_deck',
    title: 'Get a deck',
    description: [
      "Read one of the user's decks with its commanders, cards, basic lands, deck priority, deck revision, deck validity, violations, estimated bracket, and bracket signals.",
      'Read the rules text and other card details of deck cards with get_cards and their printing_ids.',
      'A deck card is planned_out when an open planned swap takes it out.',
      estimatedBracket,
      usdPrices,
    ].join(' '),
    annotations: readOnly,
    contract: databaseFunctions.get_deck,
    input: z.strictObject({ deck_id: id.describe("The deck's ID.") }),
    leftOut: { cards: ['added_at', 'commander_at', 'condition', 'language', 'rarity', 'collector_number', 'set'] },
    summary: (result) => `${result.name}: ${result.card_count} cards at deck revision ${result.revision}.`,
    tooLargeHint: "Search the deck's cards with search_collection and its deck filter instead.",
  }),
  defineTool({
    name: 'list_deck_changes',
    title: 'List deck changes',
    description: [
      "Read a deck's change history, newest first. Each deck change lists the copies and basic lands moved into or out of the deck, and the commanders made or moved to the main deck. A reverted deck change was undone by a later revert.",
      'A swapped_in deck change came from a planned swap, and a bought deck change from a buylist card. Each keeps the reason of its planned swap or buylist card.',
    ].join(' '),
    annotations: readOnly,
    contract: databaseFunctions.list_deck_changes,
    input: z.strictObject({
      deck_id: id.describe("The deck's ID."),
      ...page,
    }),
    summary: (result) => pageSummary(plural(result.items.length, 'deck change', 'deck changes'), result.next_cursor),
    tooLargeHint: 'Ask for fewer deck changes with limit.',
  }),
  defineTool({
    name: 'list_planned_swaps',
    title: 'List planned swaps',
    description: [
      "Read the user's planned swaps in every state, newest first: open, swapped_in, closed, and moved_to_buylist. Filter them by deck_id or status.",
      'Each planned swap has its deck, the incoming copy it holds or the incoming basic land, the outgoing deck card, the reason, the status, how it closed, and its times.',
      'An open planned swap also has its current effect: the Commander rules that swapping it in would break.',
    ].join(' '),
    annotations: readOnly,
    contract: databaseFunctions.list_planned_swaps,
    input: z.strictObject({
      deck_id: id.optional().describe("Only this deck's planned swaps."),
      status: plannedSwapStatus.optional().describe('Only planned swaps in this state. Every state by default.'),
      ...page,
    }),
    summary: (result) => pageSummary(plural(result.items.length, 'planned swap'), result.next_cursor),
    tooLargeHint: 'Ask for fewer planned swaps with limit, or filter by deck_id or status.',
  }),
  defineTool({
    name: 'list_buylist',
    title: 'List the buylist',
    description: [
      "Read the user's buylist cards in every state, newest first: open, bought, and closed. Filter them by deck_id or status.",
      'Each buylist card has its deck, the card to buy, the outgoing deck card, the reason, the status, how it closed, and its times.',
      'An open buylist card also has its current effect: the Commander rules that putting the card into the deck would break.',
    ].join(' '),
    annotations: readOnly,
    contract: databaseFunctions.list_buylist,
    input: z.strictObject({
      deck_id: id.optional().describe("Only this deck's buylist cards."),
      status: buylistCardStatus.optional().describe('Only buylist cards in this state. Every state by default.'),
      ...page,
    }),
    summary: (result) => pageSummary(plural(result.items.length, 'buylist card'), result.next_cursor),
    tooLargeHint: 'Ask for fewer buylist cards with limit, or filter by deck_id or status.',
  }),
  defineTool({
    name: 'create_planned_swaps',
    title: 'Create planned swaps',
    description: [
      'Make 1 to 10 planned swaps in one call, all saved or none.',
      'Each planned swap names the incoming card, an optional outgoing card, and a reason of 20 to 600 characters.',
      'The incoming card is a free copy that the user owns, or a basic land. The outgoing card is a copy in the deck, or a basic land, which means one fewer of it.',
      'Send the deck revision from get_deck, and a new idempotency_key for each new call. A retry with the same key and input returns the first result.',
      'This tool does not change any deck. The planned swap holds the copy until the user swaps it in or closes it in the app.',
      'Find free copies with search_collection and is_free. Never choose a protected copy.',
      'Read past planned swaps with list_planned_swaps first.',
      declinedWrite,
    ].join(' '),
    annotations: write,
    contract: databaseFunctions.create_planned_swaps,
    input: z.strictObject({
      idempotency_key: keyPattern(8).describe('8 to 64 of A-Z a-z 0-9 _ -. Send a new key for each new call.'),
      planned_swaps: z.array(plannedSwapInput).min(1).max(10),
    }),
    summary: (result) => {
      const warningCount = result.planned_swaps.reduce((count, swap) => count + swap.warnings.length, 0);
      return `${result.replayed ? 'Replayed' : 'Saved'} ${plural(result.planned_swaps.length, 'planned swap')} with ${plural(warningCount, 'warning')}.`;
    },
    tooLargeHint: 'Send fewer planned swaps in one call.',
  }),
  defineTool({
    name: 'create_buylist_cards',
    title: 'Create buylist cards',
    description: [
      'Add 1 to 10 buylist cards in one call, all saved or none.',
      'Each buylist card names a card that the user has to buy for a deck, an optional outgoing card, and a reason of 20 to 600 characters.',
      'The outgoing card is a copy in the deck, or a basic land, which means one fewer of it.',
      'Send the deck revision from get_deck, and a new idempotency_key for each new call. A retry with the same key and input returns the first result.',
      'This tool does not change any deck. The user marks the buylist card bought in the app after scanning a new copy.',
      'When the user has a free copy of the card that is not protected, make a planned swap with it instead. Basic lands are never bought.',
      'Read past buylist cards with list_buylist first.',
      declinedWrite,
    ].join(' '),
    annotations: write,
    contract: databaseFunctions.create_buylist_cards,
    input: z.strictObject({
      idempotency_key: keyPattern(8).describe('8 to 64 of A-Z a-z 0-9 _ -. Send a new key for each new call.'),
      buylist_cards: z.array(buylistCardInput).min(1).max(10),
    }),
    summary: (result) => {
      const warningCount = result.buylist_cards.reduce((count, card) => count + card.warnings.length, 0);
      return `${result.replayed ? 'Replayed' : 'Saved'} ${plural(result.buylist_cards.length, 'buylist card')} with ${plural(warningCount, 'warning')}.`;
    },
    tooLargeHint: 'Send fewer buylist cards in one call.',
  }),
  defineTool({
    name: 'close_planned_swap',
    title: 'Close a planned swap',
    description: [
      'Close any open planned swap when it no longer fits, even one that another AI client made.',
      'This tool does not change any deck. Its held copy becomes free.',
      'Closing a closed planned swap changes nothing and returns changed: false. A planned swap that was swapped in or moved to the buylist returns not-open.',
      'To change a planned swap, close it and make a new one. Find planned swap IDs with list_planned_swaps.',
      declinedWrite,
    ].join(' '),
    annotations: write,
    contract: databaseFunctions.mcp_close_planned_swap,
    input: z.strictObject({ planned_swap_id: id.describe("The planned swap's ID.") }),
    summary: (result) => (result.changed ? `Closed planned swap ${result.id}.` : `Planned swap ${result.id} was already closed.`),
    tooLargeHint: 'Close one planned swap in each call.',
  }),
  defineTool({
    name: 'close_buylist_card',
    title: 'Close a buylist card',
    description: [
      'Close any open buylist card when it no longer fits, even one that another AI client added.',
      'This tool does not change any deck.',
      'Closing a closed buylist card changes nothing and returns changed: false. A buylist card that was bought returns not-open.',
      'To change a buylist card, close it and add a new one. Find buylist card IDs with list_buylist.',
      declinedWrite,
    ].join(' '),
    annotations: write,
    contract: databaseFunctions.mcp_close_buylist_card,
    input: z.strictObject({ buylist_card_id: id.describe("The buylist card's ID.") }),
    summary: (result) => (result.changed ? `Closed buylist card ${result.id}.` : `Buylist card ${result.id} was already closed.`),
    tooLargeHint: 'Close one buylist card in each call.',
  }),
  defineTool({
    name: 'create_user_tag',
    title: 'Create a user tag',
    description: [
      'Create a user tag, which the user puts on individual copies.',
      'The name is trimmed and has 1 to 64 characters.',
      'When the user already has a user tag with the name, ignoring case, it returns that user tag with created: false and changes nothing.',
      'Read the user tags with list_user_tags first. Put a user tag on copies with set_copies_user_tag.',
      declinedWrite,
    ].join(' '),
    annotations: write,
    contract: databaseFunctions.mcp_create_user_tag,
    input: z.strictObject({ name: z.string().describe("The user tag's name, 1 to 64 characters after trimming.") }),
    summary: (result) => (result.created ? `Created user tag ${result.name}.` : `The user already has user tag ${result.name}.`),
    tooLargeHint: 'Create one user tag in each call.',
  }),
  defineTool({
    name: 'rename_user_tag',
    title: 'Rename a user tag',
    description: [
      "Rename one of the user's user tags. It stays on its copies.",
      'The name is trimmed and has 1 to 64 characters.',
      'A name that another user tag has, ignoring case, is refused with user-tag-exists. Renaming a user tag to its own name in another case works.',
      'A deleted user tag is not-found. Restore it with restore_user_tag first.',
      'Find user tag IDs with list_user_tags.',
      declinedWrite,
    ].join(' '),
    annotations: write,
    contract: databaseFunctions.mcp_rename_user_tag,
    input: z.strictObject({
      user_tag_id: id.describe("The user tag's ID."),
      name: z.string().describe("The user tag's new name, 1 to 64 characters after trimming."),
    }),
    summary: (result) => `Renamed the user tag to ${result.name}.`,
    tooLargeHint: 'Rename one user tag in each call.',
  }),
  defineTool({
    name: 'delete_user_tag',
    title: 'Delete a user tag',
    description: [
      "Delete one of the user's user tags. It comes off every copy, and its name is free for a new user tag.",
      'Before you delete a user tag, tell the user how many copies have it, from the copy_count of list_user_tags.',
      'The result has copy_count, the number of copies that lost the user tag.',
      'Deleting a deleted user tag changes nothing and returns changed: false.',
      'Restore a deleted user tag with restore_user_tag.',
      'This tool does not change any deck or copy.',
      declinedWrite,
    ].join(' '),
    annotations: destructiveWrite,
    contract: databaseFunctions.mcp_delete_user_tag,
    input: z.strictObject({ user_tag_id: id.describe("The user tag's ID.") }),
    summary: (result) =>
      result.changed
        ? `Deleted the user tag. ${plural(result.copy_count, 'copy', 'copies')} lost it.`
        : 'The user tag was already deleted.',
    tooLargeHint: 'Delete one user tag in each call.',
  }),
  defineTool({
    name: 'restore_user_tag',
    title: 'Restore a user tag',
    description: [
      'Restore a deleted user tag. It comes back on exactly the copies it was on when it was deleted.',
      'Find deleted user tags with list_user_tags and deleted: true. Their copy_count is the copies that each would come back on.',
      'Restoring a user tag that is not deleted changes nothing and returns changed: false.',
      'When another user tag now has its name, ignoring case, the restore is refused with user-tag-exists. Ask the user whether to rename that user tag first.',
      'This tool does not change any deck or copy.',
      declinedWrite,
    ].join(' '),
    annotations: write,
    contract: databaseFunctions.mcp_restore_user_tag,
    input: z.strictObject({ user_tag_id: id.describe("The deleted user tag's ID.") }),
    summary: (result) =>
      result.changed
        ? `Restored user tag ${result.name} on ${plural(result.copy_count, 'copy', 'copies')}.`
        : `User tag ${result.name} was not deleted.`,
    tooLargeHint: 'Restore one user tag in each call.',
  }),
  defineTool({
    name: 'set_copies_user_tag',
    title: 'Put a user tag on copies',
    description: [
      'Put a user tag on 1 to 100 copies, or take it off them, in one call.',
      'A refused call changes no copy.',
      'A user tag goes on exact copies, never on a card, so copies that the user scans later do not get it.',
      'Find copy IDs with search_collection. To put the user tag on every copy of a card, search its copies first.',
      'Find user tag IDs with list_user_tags, or create one with create_user_tag. A deleted user tag is not-found.',
      "A copy ID that is not one of the user's copies, such as a copy that the user deleted, is skipped as missing. It does not refuse the call, so the other copies still change.",
      'A copy that already has the asked state counts as changed. A retry gives the same answer.',
      'This tool does not change any deck or copy.',
      declinedWrite,
    ].join(' '),
    annotations: write,
    contract: databaseFunctions.mcp_set_copies_user_tag,
    input: z.strictObject({
      copy_ids: z.array(id).min(1).max(100).meta({ uniqueItems: true }).describe('1 to 100 unique copy IDs from search_collection.'),
      user_tag_id: id.describe("The user tag's ID."),
      tagged: z.boolean().describe('true puts the user tag on the copies. false takes it off.'),
    }),
    summary: (result) =>
      `${plural(result.changed.length, 'copy', 'copies')} changed, ${plural(result.skipped.length, 'copy', 'copies')} skipped.`,
    tooLargeHint: 'Send fewer copy IDs in one call.',
  }),
];

import type { Tool as ListedTool, ToolAnnotations } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { problem, problemSchema, type Problem } from './problems.ts';

export type Tool = Pick<ListedTool, 'name' | 'inputSchema' | 'outputSchema'> & {
  title: string;
  description: string;
  annotations: ToolAnnotations;
  postgresFunction: string;
  input: z.ZodObject;
  leftOut: Record<string, string[]>;
  summary: (result: unknown) => string;
  tooLargeHint: string;
};

type ToolDefinition<Output extends z.ZodType> = Omit<Tool, 'inputSchema' | 'outputSchema' | 'summary' | 'leftOut'> & {
  output: Output;
  leftOut?: Tool['leftOut'];
  summary: (result: z.infer<Output>) => string;
};

const pageSize = { default: 20, max: 50 };

const readOnly: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

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

function defineTool<Output extends z.ZodType>({ output, summary, ...tool }: ToolDefinition<Output>): Tool {
  return {
    leftOut: {},
    ...tool,
    inputSchema: jsonSchemaOf(tool.input),
    outputSchema: { type: 'object', anyOf: [jsonSchemaOf(output), problemSchema] },
    summary: (result) => summary(result as z.infer<Output>),
  };
}

function withoutKeys(isLeftOut: (key: string) => boolean, value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => withoutKeys(isLeftOut, item));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !isLeftOut(key))
        .map(([key, member]) => [key, withoutKeys(isLeftOut, member)]),
    );
  }
  return value;
}

export function toolResult(tool: Tool, result: unknown): Record<string, unknown> {
  const shown = withoutKeys(isImageField, result) as Record<string, unknown>;
  for (const [field, keys] of Object.entries(tool.leftOut)) {
    shown[field] = withoutKeys((key) => keys.includes(key), shown[field]);
  }
  return shown;
}

const id = z.guid();
const color = z.enum(['W', 'U', 'B', 'R', 'G']);
const finish = z.enum(['nonfoil', 'foil', 'etched']);
const rarity = z.enum(['common', 'uncommon', 'rare', 'mythic', 'special', 'bonus']);
const condition = z.enum(['near_mint', 'lightly_played', 'moderately_played', 'heavily_played', 'damaged']);
const language = z.enum(['en', 'ja', 'de', 'fr', 'it', 'es', 'pt', 'ko', 'ru', 'zhs', 'zht']);
const deckRole = z.enum(['commander', 'main']);
const comboBracketTag = z.enum(['ruthless', 'spicy', 'powerful', 'oddball', 'core', 'exhibition', 'banned']);
const estimatedBracketValue = z.union([z.literal(2), z.literal(3), z.literal(4)]);
const deckPriority = z.enum(['high', 'medium', 'low']);
const deckRule = z.enum(['no_commander', 'commander_eligibility', 'partner', 'deck_size', 'singleton', 'color_identity', 'banned', 'not_legal']);
const nextCursor = z.string().nullable();
const integer = z.number().int();

function plural(amount: number, one: string, many = `${one}s`): string {
  return `${amount} ${amount === 1 ? one : many}`;
}

function pageSummary(rows: string, next: string | null): string {
  return `${rows}.${next ? ' More with next_cursor.' : ''}`;
}

const page = {
  limit: z.number().int().min(1).max(pageSize.max).optional().describe(`Rows per page, ${pageSize.default} by default.`),
  cursor: z.string().nullable().optional().describe('The next_cursor of the previous page. Leave it out for the first page.'),
};

export function pagedArguments(
  tool: Tool,
  toolArguments: Record<string, unknown>,
): { toolArguments: Record<string, unknown> } | { problem: Problem } {
  if (tool.input.shape.limit !== page.limit) {
    return { toolArguments };
  }
  if (Number(toolArguments.limit) > pageSize.max) {
    return { problem: problem('invalid-argument', `limit can be at most ${pageSize.max} over MCP.`, { pointer: '/limit' }) };
  }
  return { toolArguments: { limit: pageSize.default, ...toolArguments } };
}

const catalogFilters = {
  text: z.string().optional().describe('Words to match in card names, types, and rules text.'),
  names: z.array(z.string()).optional(),
  names_exclude: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  types_exclude: z.array(z.string()).optional(),
  colors: z.array(z.enum(['W', 'U', 'B', 'R', 'G', 'C'])).optional(),
  colors_exclude: z.array(z.enum(['W', 'U', 'B', 'R', 'G', 'C'])).optional(),
  identity_subset_of: z.array(color).optional().describe("Only cards whose color identity fits in these colors, such as a deck's color identity."),
  mana_value_min: z.number().int().optional(),
  mana_value_max: z.number().int().optional(),
  power_min: z.number().optional(),
  power_max: z.number().optional(),
  toughness_min: z.number().optional(),
  toughness_max: z.number().optional(),
  price_min: z.string().optional().describe('A USD amount, such as "2.50".'),
  price_max: z.string().optional().describe('A USD amount, such as "2.50".'),
  keywords: z.array(z.string()).optional(),
  keywords_exclude: z.array(z.string()).optional(),
  sets: z.array(z.string()).optional().describe('Set codes, such as "mh3".'),
  sets_exclude: z.array(z.string()).optional(),
  rarities: z.array(rarity).optional(),
  rarities_exclude: z.array(rarity).optional(),
  tags: z.array(z.string()).optional().describe('Oracle tag slugs from search_oracle_tags.'),
  tags_exclude: z.array(z.string()).optional(),
  is_commander: z.boolean().optional(),
  is_game_changer: z.boolean().optional(),
  include_oracle_text: z.boolean().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
};

const catalogSort = ['relevance', 'name', 'mana_value', 'edhrec_rank', 'price', 'release_date'] as const;

const currentPrice = z.strictObject({ currency: z.literal('USD'), amount: z.string(), finish, stale: z.boolean() });

const priceFrom = z.strictObject({
  currency: z.literal('USD'),
  amount: z.string(),
  finish,
  basis: z.literal('lowest current price over printings and finishes'),
});

const ownedCopies = z.strictObject({ quantity: integer, free_quantity: integer, protected_free_quantity: integer });

const pricesAsOf = { prices_observed_at: z.string().nullable(), prices_stale: z.boolean() };

const dataAsOf = { rules_data_as_of: z.string(), rules_stale: z.boolean() };

const searchPage = { ...pricesAsOf, ...dataAsOf, next_cursor: nextCursor, search_id: id };

const catalogRow = z.strictObject({
  oracle_id: id,
  name: z.string(),
  mana_cost: z.string(),
  mana_value: z.number(),
  type_line: z.string(),
  color_identity: z.array(color),
  is_game_changer: z.boolean(),
  can_be_commander: z.boolean(),
  edhrec_rank: integer.nullable(),
  oracle_text: z.string().optional(),
  price_from: priceFrom.nullable(),
  owned: ownedCopies,
});

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

const collectionCopyRow = z.strictObject({
  copy_id: id,
  printing_id: id,
  name: z.string(),
  set: z.string(),
  collector_number: z.string(),
  rarity,
  finish,
  condition,
  language,
  protected: z.boolean(),
  price: currentPrice.nullable(),
  deck: z.strictObject({ deck_id: id, name: z.string() }).nullable(),
  oracle_text: z.string().optional(),
});

const oracleTagRow = z.strictObject({
  id,
  slug: z.string(),
  label: z.string(),
  aliases: z.array(z.string()),
  description: z.string().nullable(),
  parent_slugs: z.array(z.string()),
  card_count: integer,
});

const cardDetailsPrinting = z.strictObject({
  printing_id: id,
  set: z.string(),
  set_name: z.string(),
  collector_number: z.string(),
  rarity,
  finishes: z.array(finish),
  released_at: z.string(),
});

const cardDetailsRow = z.strictObject({
  oracle_id: id,
  name: z.string(),
  mana_cost: z.string(),
  mana_value: z.number(),
  type_line: z.string(),
  oracle_text: z.string(),
  colors: z.array(color),
  color_identity: z.array(color),
  keywords: z.array(z.string()),
  faces: z.array(
    z.strictObject({
      name: z.string(),
      mana_cost: z.string(),
      type_line: z.string(),
      oracle_text: z.string(),
      colors: z.array(color),
      power: z.string().optional(),
      toughness: z.string().optional(),
      loyalty: z.string().optional(),
    }),
  ),
  commander_legality: z.enum(['legal', 'banned', 'not_legal', 'unknown']),
  can_be_commander: z.boolean(),
  is_game_changer: z.boolean().nullable(),
  edhrec_rank: integer.nullable(),
  released_at: z.string(),
  printing_count: integer,
  price_from: priceFrom.nullable(),
  owned: ownedCopies,
  tags: z.array(z.strictObject({ slug: z.string(), label: z.string() })),
  combos: z.array(
    z.strictObject({
      spellbook_id: z.string(),
      other_card: z.strictObject({ oracle_id: id, name: z.string() }),
      produced_features: z.array(z.string()),
      bracket_tag: comboBracketTag,
    }),
  ),
  printing: cardDetailsPrinting.optional(),
});

const deckCommander = z.strictObject({ copy_id: id, name: z.string() });

const deckEvaluationSummary = {
  validity: z.enum(['valid', 'invalid', 'cannot_be_determined']),
  validity_stale: z.boolean(),
  estimated_bracket: estimatedBracketValue,
  bracket_stale: z.boolean(),
};

const deckRowFields = {
  deck_id: id,
  name: z.string(),
  priority: deckPriority,
  card_count: integer,
  commanders: z.array(deckCommander),
  last_used_at: z.string(),
  revision: integer,
};

const deckEvaluationCard = z.union([
  z.strictObject({ kind: z.literal('copy'), copy_id: id, name: z.string() }),
  z.strictObject({ kind: z.literal('basic_land'), oracle_id: id, name: z.string() }),
]);

const bracketSignalFields = {
  source: z.enum(['official', 'heuristic']),
  count: integer,
  lowest_bracket: estimatedBracketValue,
  cards: z.array(deckEvaluationCard),
};

const deckEvaluation = z.strictObject({
  ...deckEvaluationSummary,
  violations: z.array(
    z.strictObject({
      rule: deckRule,
      citation: z.string().nullable(),
      message: z.string(),
      hint: z.string().nullable(),
      cards: z.array(deckEvaluationCard),
      colors: z.array(color).optional(),
    }),
  ),
  undetermined: z.array(
    z.strictObject({ rule: z.union([deckRule, z.literal('legality')]), reason: z.string(), cards: z.array(deckEvaluationCard) }),
  ),
  chosen_color: color.nullable(),
  bracket_signals: z.array(
    z.union([
      z.strictObject({ kind: z.enum(['game_changers', 'mass_land_denial', 'extra_turns']), ...bracketSignalFields }),
      z.strictObject({
        kind: z.literal('two_card_combo'),
        ...bracketSignalFields,
        combos: z.array(
          z.strictObject({ cards: z.array(deckEvaluationCard), produced_features: z.array(z.string()), bracket_tag: comboBracketTag }),
        ),
      }),
    ]),
  ),
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

const deck = z.strictObject({
  ...deckRowFields,
  evaluation: deckEvaluation.nullable(),
  created_at: z.string(),
  cards: z.array(
    z.strictObject({
      copy_id: id,
      printing_id: id,
      name: z.string(),
      finish,
      protected: z.boolean(),
      price: currentPrice.nullable(),
      role: deckRole,
      type_line: z.string(),
      mana_value: z.number(),
      colors: z.array(color),
    }),
  ),
  basic_lands: z.array(z.strictObject({ oracle_id: id.nullable(), name: z.string(), count: integer })),
});

const deckChangeLine = z.union([
  z.strictObject({
    kind: z.literal('copy'),
    copy_id: id,
    name: z.string(),
    type_line: z.string(),
    place_before: deckRole.nullable(),
    place_after: deckRole.nullable(),
  }),
  z.strictObject({ kind: z.literal('basic_land'), oracle_id: id, name: z.string(), count_before: integer, count_after: integer }),
]);

const deckChange = z.strictObject({
  deck_change_id: id,
  revision: integer,
  kind: z.enum([
    'added',
    'removed',
    'made_commander',
    'made_partner',
    'moved_to_main_deck',
    'basic_lands',
    'removed_from_collection',
    'revert',
    'swapped_in',
  ]),
  changed_at: z.string(),
  reverted: z.boolean(),
  reason: z.string().nullable(),
  client_name: z.string().nullable(),
  lines: z.array(deckChangeLine),
});

const plannedSwapStatus = z.enum(['open', 'swapped_in', 'closed', 'moved_to_buylist']);
const closeNote = z.enum(['closed_by_user', 'closed_by_ai_client', 'outgoing_left_deck', 'held_copy_deleted', 'held_copy_reverted']);

const deckChangeEffect = z.strictObject({
  kind: z.enum(['would_make_invalid', 'adds_violation']),
  rules: z.array(z.strictObject({ rule: deckRule, colors: z.array(color).optional() })),
});

const plannedCopyLine = z.strictObject({
  kind: z.literal('copy'),
  copy_id: id,
  name: z.string(),
  type_line: z.string(),
  set: z.string().nullable(),
  collector_number: z.string().nullable(),
  finish: finish.nullable(),
  condition: condition.nullable(),
});

const plannedSwapRow = z.strictObject({
  planned_swap_id: id,
  deck_id: id,
  deck_name: z.string(),
  incoming: plannedCopyLine,
  outgoing: plannedCopyLine.nullable(),
  as_commander: z.boolean(),
  reason: z.string(),
  status: plannedSwapStatus,
  close_note: closeNote.nullable(),
  client_name: z.string().nullable(),
  created_at: z.string(),
  status_changed_at: z.string(),
  effect: deckChangeEffect.nullable(),
});

const keyPattern = (minLength: number) => z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${minLength},64}$`));

const plannedSwapInput = z.strictObject({
  ref: keyPattern(1).describe('A name for this planned swap, unique in the call.'),
  deck_id: id.describe("The deck's ID."),
  expected_deck_revision: z.number().int().min(0).describe('The deck revision that get_deck returned.'),
  incoming: z.strictObject({
    copy_id: id.describe('A free copy that the user owns. It must not be protected.'),
    as_commander: z.boolean().optional().describe('Make the incoming copy a commander. Defaults to true when the outgoing copy is a commander.'),
  }),
  outgoing: z.strictObject({ copy_id: id.describe('A copy in the deck.') }).optional(),
  reason: z.string().min(20).max(600),
});

const plannedSwapWarning = z.union([
  z.strictObject({ code: z.literal('would_break_validity'), effect: deckChangeEffect }),
  z.strictObject({ code: z.enum(['replaces_commander', 'rules_stale']) }),
]);

const createdPlannedSwaps = z.strictObject({
  planned_swaps: z.array(z.strictObject({ ref: z.string(), planned_swap_id: id, warnings: z.array(plannedSwapWarning) })),
  replayed: z.boolean(),
});

export const tools: Tool[] = [
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
    postgresFunction: 'search_catalog',
    input: z.strictObject({
      ...catalogFilters,
      sort: z.enum(catalogSort).optional().describe('relevance needs text. The default is relevance with text and name without it.'),
      ...page,
    }),
    output: z.strictObject({ ...searchPage, items: z.array(catalogRow) }),
    summary: (result) => pageSummary(plural(result.items.length, 'card', 'cards'), result.next_cursor),
    tooLargeHint: 'Ask for fewer cards with limit, or leave out include_oracle_text.',
  }),
  defineTool({
    name: 'search_collection',
    title: 'Search the collection',
    description: [
      "Search the user's copies with the filters of search_catalog, plus finish, condition, language, deck, user tag, free, protected, and allocated filters.",
      'rows entries, the default, returns collection entries: the copies that share a card printing, finish, condition, language, and protected flag, with their quantity and free quantity.',
      'rows copies returns each copy with its copy_id and the deck it is in.',
      'A free copy is not in a deck or held by a planned swap. A protected copy is one the user keeps out of decks.',
      usdPrices,
    ].join(' '),
    annotations: readOnly,
    postgresFunction: 'search_collection',
    input: z.strictObject({
      ...catalogFilters,
      rows: z.enum(['entries', 'copies']).optional(),
      sort: z.enum([...catalogSort, 'added']).optional().describe('The default is relevance with text and added without it.'),
      ...page,
      finishes: z.array(finish).optional(),
      finishes_exclude: z.array(finish).optional(),
      conditions: z.array(condition).optional(),
      conditions_exclude: z.array(condition).optional(),
      languages: z.array(language).optional(),
      languages_exclude: z.array(language).optional(),
      deck_ids: z.array(id).optional().describe('Only copies in these decks.'),
      deck_ids_exclude: z.array(id).optional(),
      is_free: z.boolean().optional(),
      is_protected: z.boolean().optional(),
      is_allocated: z.boolean().optional(),
      user_tags: z.array(z.string()).optional().describe('User tag names from list_user_tags.'),
      user_tags_exclude: z.array(z.string()).optional(),
    }),
    output: z.strictObject({
      ...searchPage,
      total_count: integer.nullable(),
      items: z.array(z.union([collectionRow, collectionCopyRow])),
    }),
    summary: (result) => {
      if (result.items.length === 0) {
        return 'Nothing in the collection matches.';
      }
      const [one, many] = result.items.some((item) => 'copy_id' in item) ? ['copy', 'copies'] : ['collection entry', 'collection entries'];
      const rows =
        result.total_count === null ? plural(result.items.length, one, many) : `${result.items.length} of ${plural(result.total_count, one, many)}`;
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
    postgresFunction: 'search_oracle_tags',
    input: z.strictObject({
      text: z.string().describe('A word or phrase that says what cards do.'),
      limit: z.number().int().min(1).max(20).optional().describe('Oracle tags to return, 10 by default.'),
    }),
    output: z.strictObject({ ...dataAsOf, items: z.array(oracleTagRow) }),
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
    postgresFunction: 'get_cards',
    input: z.strictObject({
      oracle_ids: z.array(id).min(1).max(20).optional(),
      printing_ids: z.array(id).min(1).max(20).optional(),
    }).meta({ oneOf: [{ required: ['oracle_ids'] }, { required: ['printing_ids'] }] }),
    output: z.strictObject({ ...dataAsOf, ...pricesAsOf, items: z.array(cardDetailsRow), not_found: z.array(z.string()) }),
    summary: (result) =>
      `${plural(result.items.length, 'card', 'cards')}.${result.not_found.length ? ` ${result.not_found.length} not found.` : ''}`,
    tooLargeHint: 'Ask for fewer cards in one call.',
  }),
  defineTool({
    name: 'list_card_printings',
    title: 'List card printings',
    description: 'List the card printings of one card, newest first, with how many copies of each the user owns.',
    annotations: readOnly,
    postgresFunction: 'list_card_printings',
    input: z.strictObject({
      oracle_id: id.describe("The card's oracle_id."),
      owned_only: z.boolean().optional().describe('Only card printings that the user owns.'),
      ...page,
    }),
    output: z.strictObject({
      ...dataAsOf,
      next_cursor: nextCursor,
      items: z.array(cardDetailsPrinting.extend({ owned_quantity: integer })),
    }),
    summary: (result) => pageSummary(plural(result.items.length, 'card printing', 'card printings'), result.next_cursor),
    tooLargeHint: 'Ask for fewer card printings with limit.',
  }),
  defineTool({
    name: 'list_user_tags',
    title: 'List user tags',
    description:
      "List the user's user tags with how many copies have each. A user tag is the user's own label on copies, not an Oracle tag. Search the copies of a user tag with the user_tags filter of search_collection.",
    annotations: readOnly,
    postgresFunction: 'list_user_tags',
    input: z.strictObject({}),
    output: z.strictObject({ items: z.array(z.strictObject({ user_tag_id: id, name: z.string(), copy_count: integer })) }),
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
    postgresFunction: 'get_collection_total',
    input: z.strictObject({}),
    output: z.strictObject({
      total: z.string(),
      currency: z.literal('USD'),
      priced_copies: integer,
      copies: integer,
      stale: z.boolean(),
      prices_observed_at: z.string().nullable(),
    }),
    summary: (result) => `Collection total ${result.total} USD, ${result.priced_copies} of ${result.copies} copies priced.`,
    tooLargeHint: 'Search the collection with search_collection instead.',
  }),
  defineTool({
    name: 'list_decks',
    title: 'List decks',
    description: [
      "List the user's decks, the most recently used first, with deck priority, deck revision, commanders, card count, deck validity, and estimated bracket.",
      'Read one deck with get_deck.',
      estimatedBracket,
    ].join(' '),
    annotations: readOnly,
    postgresFunction: 'list_decks',
    input: z.strictObject({}),
    output: z.strictObject({
      items: z.array(z.strictObject({ ...deckRowFields, evaluation: z.strictObject(deckEvaluationSummary).nullable() })),
    }),
    summary: (result) => `${plural(result.items.length, 'deck', 'decks')}.`,
    tooLargeHint: 'Read one deck at a time with get_deck instead.',
  }),
  defineTool({
    name: 'get_deck',
    title: 'Get a deck',
    description: [
      "Read one of the user's decks with its commanders, cards, basic lands, deck priority, deck revision, deck validity, violations, estimated bracket, and bracket signals.",
      'Read the rules text and other card details of deck cards with get_cards and their printing_ids.',
      estimatedBracket,
      usdPrices,
    ].join(' '),
    annotations: readOnly,
    postgresFunction: 'get_deck',
    input: z.strictObject({ deck_id: id.describe("The deck's ID.") }),
    output: deck,
    leftOut: { cards: ['added_at', 'commander_at', 'condition', 'language', 'rarity', 'collector_number', 'set'] },
    summary: (result) => `${result.name}: ${result.card_count} cards at deck revision ${result.revision}.`,
    tooLargeHint: "Search the deck's cards with search_collection and its deck filter instead.",
  }),
  defineTool({
    name: 'list_deck_changes',
    title: 'List deck changes',
    description: [
      "Read a deck's change history, newest first. Each deck change lists the copies and basic lands moved into or out of the deck, and the commanders made or moved to the main deck. A reverted deck change was undone by a later revert.",
      'A swapped_in deck change came from a planned swap, and keeps its reason and the name of the AI client that made it.',
    ].join(' '),
    annotations: readOnly,
    postgresFunction: 'list_deck_changes',
    input: z.strictObject({
      deck_id: id.describe("The deck's ID."),
      ...page,
    }),
    output: z.strictObject({ next_cursor: nextCursor, items: z.array(deckChange) }),
    summary: (result) => pageSummary(plural(result.items.length, 'deck change', 'deck changes'), result.next_cursor),
    tooLargeHint: 'Ask for fewer deck changes with limit.',
  }),
  defineTool({
    name: 'list_planned_swaps',
    title: 'List planned swaps',
    description: [
      "Read the user's planned swaps in every state, newest first: open, swapped_in, closed, and moved_to_buylist. Filter them by deck_id or status.",
      'Each planned swap has its deck, the incoming copy it holds, the outgoing deck card, the reason, the status, how it closed, the name of the AI client that made it, and its times.',
      'An open planned swap also has its current effect: the Commander rules that swapping it in would break.',
    ].join(' '),
    annotations: readOnly,
    postgresFunction: 'list_planned_swaps',
    input: z.strictObject({
      deck_id: id.optional().describe("Only this deck's planned swaps."),
      status: plannedSwapStatus.optional().describe('Only planned swaps in this state. Every state by default.'),
      ...page,
    }),
    output: z.strictObject({ next_cursor: nextCursor, items: z.array(plannedSwapRow) }),
    summary: (result) => pageSummary(plural(result.items.length, 'planned swap'), result.next_cursor),
    tooLargeHint: 'Ask for fewer planned swaps with limit, or filter by deck_id or status.',
  }),
  defineTool({
    name: 'create_planned_swaps',
    title: 'Create planned swaps',
    description: [
      'Make 1 to 10 planned swaps in one call, all saved or none.',
      'Each planned swap names a free copy that the user owns as the incoming card, an optional outgoing copy in the deck, and a reason of 20 to 600 characters.',
      'Send the deck revision from get_deck, and a new idempotency_key for each new call. A retry with the same key and input returns the first result.',
      'This tool does not change any deck. The planned swap holds the copy until the user swaps it in or closes it in the app.',
      'Find free copies with search_collection, rows copies, and is_free. Never choose a protected copy.',
      'Read past planned swaps with list_planned_swaps first.',
      declinedWrite,
    ].join(' '),
    annotations: write,
    postgresFunction: 'create_planned_swaps',
    input: z.strictObject({
      idempotency_key: keyPattern(8).describe('8 to 64 of A-Z a-z 0-9 _ -. Send a new key for each new call.'),
      planned_swaps: z.array(plannedSwapInput).min(1).max(10),
    }),
    output: createdPlannedSwaps,
    summary: (result) => {
      const warningCount = result.planned_swaps.reduce((count, swap) => count + swap.warnings.length, 0);
      return `${result.replayed ? 'Replayed' : 'Saved'} ${plural(result.planned_swaps.length, 'planned swap')} with ${plural(warningCount, 'warning')}.`;
    },
    tooLargeHint: 'Send fewer planned swaps in one call.',
  }),
];

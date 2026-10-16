import type { Tool as ListedTool, ToolAnnotations } from '@modelcontextprotocol/server';
import { z } from 'zod';

import { problemSchema } from './problems.ts';

export type Tool = Pick<ListedTool, 'name' | 'inputSchema' | 'outputSchema'> & {
  title: string;
  description: string;
  annotations: ToolAnnotations;
  postgresFunction: string;
  postgresArgument: 'query' | 'request';
  leftOut: Record<string, string[]>;
  summary: (result: unknown) => string;
  tooLargeHint: string;
};

type ToolDefinition<Output extends z.ZodType> = Omit<Tool, 'inputSchema' | 'outputSchema' | 'summary'> & {
  input: z.ZodObject;
  output: Output;
  summary: (result: z.infer<Output>) => string;
};

const readOnly: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const write: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const usdPrices = 'Prices are current Scryfall prices in USD (TCGplayer Market). There is no other currency.';
const estimatedBracket =
  'The estimated bracket is an estimate for a pregame conversation, not a certified bracket. Signals labelled heuristic are not official.';

function isImageField(key: string): boolean {
  return key === 'image_uris' || key.endsWith('art_crop_uri');
}

function jsonSchemaOf(schema: z.ZodType): ListedTool['inputSchema'] {
  const { $schema: _, ...jsonSchema } = z.toJSONSchema(schema);
  return jsonSchema as ListedTool['inputSchema'];
}

function defineTool<Output extends z.ZodType>({ input, output, summary, ...tool }: ToolDefinition<Output>): Tool {
  return {
    ...tool,
    inputSchema: jsonSchemaOf(input),
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
const estimatedBracketValue = z.union([z.literal(2), z.literal(3), z.literal(4)]);
const deckPriority = z.enum(['high', 'medium', 'low']);
const deckRule = z.enum(['no_commander', 'commander_eligibility', 'partner', 'deck_size', 'singleton', 'color_identity', 'banned', 'not_legal']);

const currentPrice = z.strictObject({ currency: z.literal('USD'), amount: z.string(), finish, stale: z.boolean() });

const deckEvaluationCard = z.union([
  z.strictObject({ kind: z.literal('copy'), copy_id: id, name: z.string() }),
  z.strictObject({ kind: z.literal('basic_land'), oracle_id: id, name: z.string() }),
]);

const bracketSignalFields = {
  source: z.enum(['official', 'heuristic']),
  count: z.number().int(),
  lowest_bracket: estimatedBracketValue,
  cards: z.array(deckEvaluationCard),
};

const deckEvaluation = z.strictObject({
  validity: z.enum(['valid', 'invalid', 'cannot_be_determined']),
  validity_stale: z.boolean(),
  estimated_bracket: estimatedBracketValue,
  bracket_stale: z.boolean(),
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
          z.strictObject({
            cards: z.array(deckEvaluationCard),
            produced_features: z.array(z.string()),
            bracket_tag: z.enum(['ruthless', 'spicy', 'powerful', 'oddball', 'core', 'exhibition', 'banned']),
          }),
        ),
      }),
    ]),
  ),
  missing_signal_count: z.number().int(),
  revision: z.number().int(),
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
  deck_id: id,
  name: z.string(),
  priority: deckPriority,
  card_count: z.number().int(),
  commanders: z.array(z.strictObject({ copy_id: id, name: z.string() })),
  last_used_at: z.string(),
  evaluation: deckEvaluation.nullable(),
  revision: z.number().int(),
  created_at: z.string(),
  cards: z.array(
    z.strictObject({
      copy_id: id,
      printing_id: id,
      name: z.string(),
      finish,
      protected: z.boolean(),
      price: currentPrice.nullable(),
      role: z.enum(['commander', 'main']),
      type_line: z.string(),
      mana_value: z.number(),
      colors: z.array(color),
    }),
  ),
  basic_lands: z.array(z.strictObject({ oracle_id: id.nullable(), name: z.string(), count: z.number().int() })),
});

const suggestionKey = (minLength: number) => z.string().regex(new RegExp(`^[A-Za-z0-9_-]{${minLength},64}$`));

const deckSuggestionInput = z.strictObject({
  ref: suggestionKey(1).describe('A name for this suggestion, unique in the call, such as to_b. pair_with names it.'),
  deck_id: id.describe("The deck's ID."),
  expected_deck_revision: z.number().int().min(0).describe('The deck revision that get_deck returned.'),
  incoming: z.strictObject({
    oracle_id: id.describe('The incoming card. It may be a basic land card.'),
    as_commander: z.boolean().optional().describe('Make the incoming card a commander. Defaults to true when the outgoing copy is a commander.'),
    from_deck_id: id.optional().describe('The deck the copy moves out of. Send it with pair_with.'),
  }),
  outgoing: z
    .union([
      z.strictObject({ copy_id: id.describe('A copy in the deck.') }),
      z.strictObject({ basic_land_oracle_id: id.describe('A basic land card in the deck, meaning one fewer of it.') }),
    ])
    .optional(),
  reason: z.string().min(20).max(600),
  pair_with: suggestionKey(1).optional().describe('The ref of the suggestion that takes the copy out of from_deck_id.'),
});

const deckSuggestionWarning = z.union([
  z.strictObject({
    code: z.literal('would_break_validity'),
    effect: z.strictObject({
      kind: z.enum(['would_make_invalid', 'adds_violation']),
      rules: z.array(z.strictObject({ rule: deckRule, colors: z.array(color).optional() })),
    }),
  }),
  z.strictObject({ code: z.enum(['protected_only', 'not_owned', 'replaces_commander', 'rules_stale']) }),
  z.strictObject({
    code: z.literal('in_other_decks'),
    decks: z.array(z.strictObject({ deck_id: id, name: z.string(), priority: deckPriority })),
  }),
  z.strictObject({ code: z.literal('against_deck_priority'), from_deck_priority: deckPriority, deck_priority: deckPriority }),
]);

const createdDeckSuggestions = z.strictObject({
  suggestions: z.array(
    z.strictObject({ ref: z.string(), suggestion_id: id, paired_suggestion_id: id.nullable(), warnings: z.array(deckSuggestionWarning) }),
  ),
  replayed: z.boolean(),
});

export const tools: Tool[] = [
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
    postgresArgument: 'query',
    input: z.strictObject({ deck_id: id.describe("The deck's ID.") }),
    output: deck,
    leftOut: { cards: ['added_at', 'commander_at', 'condition', 'language', 'rarity', 'collector_number', 'set'] },
    summary: (result) => `${result.name}: ${result.card_count} cards at deck revision ${result.revision}.`,
    tooLargeHint: "Search the deck's cards with search_collection and its deck filter instead.",
  }),
  defineTool({
    name: 'create_deck_suggestions',
    title: 'Create deck suggestions',
    description: [
      'Make 1 to 10 deck suggestions in one call, all saved or none.',
      'Each suggestion names an incoming card, an optional outgoing card in the deck, and a reason of 20 to 600 characters.',
      'Send the deck revision from get_deck, and a new idempotency_key for each new call. A retry with the same key and input returns the first result.',
      'This tool does not change any deck. The user reviews each suggestion in the app and decides.',
      'Never offer a protected copy as the reason a card is available.',
      'When two decks want a card and there is one copy for them, the deck with the higher deck priority should get it. Between decks of equal priority, decide which deck needs it more. To move a card, send a pair of suggestions in one call, and make each reason name the other.',
      'Read past suggestions with list_deck_suggestions first.',
    ].join(' '),
    annotations: write,
    postgresFunction: 'create_deck_suggestions',
    postgresArgument: 'request',
    input: z.strictObject({
      idempotency_key: suggestionKey(8).describe('8 to 64 of A-Z a-z 0-9 _ -. Send a new key for each new call.'),
      suggestions: z.array(deckSuggestionInput).min(1).max(10),
    }),
    output: createdDeckSuggestions,
    leftOut: {},
    summary: (result) => {
      const warningCount = result.suggestions.reduce((count, suggestion) => count + suggestion.warnings.length, 0);
      return `${result.replayed ? 'Replayed' : 'Saved'} ${result.suggestions.length} deck suggestions with ${warningCount} warnings.`;
    },
    tooLargeHint: 'Send fewer suggestions in one call.',
  }),
];

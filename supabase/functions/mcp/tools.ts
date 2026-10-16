import type { Tool as ListedTool, ToolAnnotations } from '@modelcontextprotocol/server';

import { problemSchema } from './problems.ts';

type JsonSchema = Record<string, unknown>;

export type Tool = Required<Pick<ListedTool, 'name' | 'title' | 'description' | 'annotations' | 'inputSchema' | 'outputSchema'>> & {
  postgresFunction: string;
  leftOut: string[];
  summary: (result: never) => string;
  narrowing: string;
};

const readOnly: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const usdPrices = 'Prices are current Scryfall prices in USD (TCGplayer Market). There is no other currency.';
const estimatedBracket =
  'The estimated bracket is an estimate for a pregame conversation, not a certified bracket. Signals labelled heuristic are not official.';

const uuid = { type: 'string', format: 'uuid' };
const timestamp = { type: 'string', format: 'date-time' };
const nullable = (schema: JsonSchema) => ({ anyOf: [schema, { type: 'null' }] });
const finish = { enum: ['nonfoil', 'foil', 'etched'] };
const price = nullable({
  type: 'object',
  properties: { amount: { type: 'string' }, currency: { const: 'USD' }, finish, stale: { type: 'boolean' } },
  required: ['amount', 'currency', 'finish', 'stale'],
});
const evaluationCard = {
  type: 'object',
  properties: { kind: { enum: ['copy', 'basic_land'] }, copy_id: uuid, oracle_id: uuid, name: { type: 'string' } },
  required: ['kind', 'name'],
};

const deckSchema = {
  type: 'object',
  properties: {
    deck_id: uuid,
    name: { type: 'string' },
    priority: { enum: ['high', 'medium', 'low'] },
    revision: { type: 'integer' },
    card_count: { type: 'integer' },
    created_at: timestamp,
    last_used_at: timestamp,
    commanders: {
      type: 'array',
      items: { type: 'object', properties: { copy_id: uuid, name: { type: 'string' } }, required: ['copy_id', 'name'] },
    },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          copy_id: uuid,
          printing_id: uuid,
          name: { type: 'string' },
          finish,
          protected: { type: 'boolean' },
          price,
          role: { enum: ['commander', 'main'] },
          type_line: { type: 'string' },
          mana_value: { type: 'number' },
          colors: { type: 'array', items: { enum: ['W', 'U', 'B', 'R', 'G'] } },
        },
        required: ['copy_id', 'printing_id', 'name', 'role', 'protected', 'price', 'finish', 'type_line', 'mana_value', 'colors'],
      },
    },
    basic_lands: {
      type: 'array',
      items: {
        type: 'object',
        properties: { oracle_id: nullable(uuid), name: { type: 'string' }, count: { type: 'integer' } },
        required: ['oracle_id', 'name', 'count'],
      },
    },
    evaluation: nullable({
      type: 'object',
      properties: {
        validity: { enum: ['valid', 'invalid', 'cannot_be_determined'] },
        validity_stale: { type: 'boolean' },
        violations: {
          type: 'array',
          items: {
            type: 'object',
            properties: { rule: { type: 'string' }, message: { type: 'string' }, cards: { type: 'array', items: evaluationCard } },
            required: ['rule', 'message', 'cards'],
          },
        },
        estimated_bracket: { enum: [2, 3, 4] },
        bracket_stale: { type: 'boolean' },
        bracket_signals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              kind: { type: 'string' },
              source: { enum: ['official', 'heuristic'] },
              lowest_bracket: { enum: [2, 3, 4] },
              cards: { type: 'array', items: evaluationCard },
            },
            required: ['kind', 'source', 'lowest_bracket', 'cards'],
          },
        },
      },
      required: ['validity', 'validity_stale', 'violations', 'estimated_bracket', 'bracket_stale', 'bracket_signals'],
    }),
  },
  required: ['deck_id', 'name', 'priority', 'revision', 'card_count', 'commanders', 'cards', 'basic_lands', 'evaluation'],
};

type DeckSummary = { name: string; card_count: number; revision: number };

export const tools: Tool[] = [
  {
    name: 'get_deck',
    title: 'Get a deck',
    description: [
      "Read one of the user's decks with its commanders, cards, basic lands, deck priority, deck revision, deck validity, violations, estimated bracket, and bracket signals.",
      'Read the rules text and other card details of deck cards with get_cards and their printing_ids.',
      estimatedBracket,
      usdPrices,
    ].join(' '),
    postgresFunction: 'get_deck',
    leftOut: ['added_at', 'commander_at', 'condition', 'language', 'rarity', 'collector_number', 'set'],
    annotations: readOnly,
    inputSchema: {
      type: 'object',
      properties: { deck_id: { ...uuid, description: "The deck's ID." } },
      required: ['deck_id'],
      additionalProperties: false,
    },
    outputSchema: { type: 'object', anyOf: [deckSchema, problemSchema] },
    summary: (deck: DeckSummary) => `${deck.name}: ${deck.card_count} cards at deck revision ${deck.revision}.`,
    narrowing: "Search the deck's cards with search_collection and its deck filter instead.",
  },
];

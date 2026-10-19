import { z } from 'zod';

import { databaseFunction } from './database-function.ts';
import type { Database } from './database.types.ts';
import { color, comboBracketTag, commanderLegality, finish, id, integer, nextCursor, rarity } from './fields.ts';

export type Color = z.infer<typeof color>;

export type Rarity = Database['public']['Enums']['card_rarity'];

export const catalogSort = z.enum(['relevance', 'name', 'mana_value', 'edhrec_rank', 'price', 'release_date']);

export type CatalogSort = z.infer<typeof catalogSort>;

export type Finish = Database['public']['Enums']['card_finish'];

const colorOrColorless = z.enum([...color.options, 'C']);

export const catalogFilters = {
  text: z.string().optional(),
  names: z.array(z.string()).optional(),
  names_exclude: z.array(z.string()).optional(),
  types: z.array(z.string()).optional(),
  types_exclude: z.array(z.string()).optional(),
  colors: z.array(colorOrColorless).optional(),
  colors_exclude: z.array(colorOrColorless).optional(),
  identity_subset_of: z.array(color).optional(),
  mana_value_min: z.number().optional(),
  mana_value_max: z.number().optional(),
  power_min: z.number().optional(),
  power_max: z.number().optional(),
  toughness_min: z.number().optional(),
  toughness_max: z.number().optional(),
  price_min: z.string().optional(),
  price_max: z.string().optional(),
  keywords: z.array(z.string()).optional(),
  keywords_exclude: z.array(z.string()).optional(),
  sets: z.array(z.string()).optional(),
  sets_exclude: z.array(z.string()).optional(),
  rarities: z.array(rarity).optional(),
  rarities_exclude: z.array(rarity).optional(),
  tags: z.array(z.string()).optional(),
  tags_exclude: z.array(z.string()).optional(),
  is_commander: z.boolean().optional(),
  is_game_changer: z.boolean().optional(),
  include_oracle_text: z.boolean().optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  limit: integer.optional(),
  cursor: z.string().nullable().optional(),
};

const catalogQuery = z.strictObject({ ...catalogFilters, sort: catalogSort.optional() });

export type CatalogQuery = z.input<typeof catalogQuery>;

export const pricesAsOf = { prices_observed_at: z.string().nullable(), prices_stale: z.boolean() };

export const dataAsOf = { rules_data_as_of: z.string(), rules_stale: z.boolean() };

export const searchPage = { ...pricesAsOf, ...dataAsOf, next_cursor: nextCursor, search_id: id };

export const priceFrom = z.strictObject({
  currency: z.literal('USD'),
  amount: z.string(),
  finish,
  basis: z.literal('lowest current price over printings and finishes'),
});

export type PriceFrom = z.infer<typeof priceFrom>;

const ownedCopies = z.strictObject({ quantity: integer, free_quantity: integer, protected_free_quantity: integer });

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

export type CatalogRow = z.infer<typeof catalogRow>;

const catalogPage = z.strictObject({ ...searchPage, items: z.array(catalogRow) });

export type SearchPage<Row> = Omit<z.infer<typeof catalogPage>, 'items'> & { items: Row[] };

export type CommanderLegality = Database['public']['Enums']['commander_legality'];

export type ComboBracketTag = Database['public']['Enums']['combo_bracket_tag'];

const cardDetailsQuery = z.union([z.strictObject({ oracle_ids: z.array(id) }), z.strictObject({ printing_ids: z.array(id) })]);

export type CardDetailsQuery = z.input<typeof cardDetailsQuery>;

const cardFace = z.strictObject({
  name: z.string(),
  mana_cost: z.string(),
  type_line: z.string(),
  oracle_text: z.string(),
  colors: z.array(color),
  power: z.string().optional(),
  toughness: z.string().optional(),
  loyalty: z.string().optional(),
});

export const cardDetailsPrinting = z.strictObject({
  printing_id: id,
  set: z.string(),
  set_name: z.string(),
  collector_number: z.string(),
  rarity,
  finishes: z.array(finish),
  released_at: z.string(),
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

export type OracleTagRow = z.infer<typeof oracleTagRow>;

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
  faces: z.array(cardFace),
  commander_legality: commanderLegality,
  can_be_commander: z.boolean(),
  is_game_changer: z.boolean().nullable(),
  edhrec_rank: integer.nullable(),
  released_at: z.string(),
  printing_count: integer,
  price_from: priceFrom.nullable(),
  owned: ownedCopies,
  tags: z.array(oracleTagRow.pick({ slug: true, label: true })),
  combos: z.array(
    z.strictObject({
      spellbook_id: z.string(),
      other_card: catalogRow.pick({ oracle_id: true, name: true }),
      produced_features: z.array(z.string()),
      bracket_tag: comboBracketTag,
    }),
  ),
  printing: cardDetailsPrinting.optional(),
});

const cardDetails = z.strictObject({ ...dataAsOf, ...pricesAsOf, items: z.array(cardDetailsRow), not_found: z.array(z.string()) });

export type CardDetails = z.infer<typeof cardDetails>;

const cardPrintingsQuery = z.strictObject({
  oracle_id: id,
  owned_only: z.boolean().optional(),
  limit: integer.optional(),
  cursor: z.string().nullable().optional(),
});

export type CardPrintingsQuery = z.input<typeof cardPrintingsQuery>;

const cardPrintingRow = cardDetailsPrinting.extend({ image_uris: z.array(z.string()), owned_quantity: integer });

export type CardPrintingRow = z.infer<typeof cardPrintingRow>;

const cardPrintingsPage = z.strictObject({ ...dataAsOf, next_cursor: nextCursor, items: z.array(cardPrintingRow) });

export type CardPrintingsPage = z.infer<typeof cardPrintingsPage>;

const tagLookupQuery = z.strictObject({ text: z.string(), limit: integer.optional() });

export type TagLookupQuery = z.input<typeof tagLookupQuery>;

const tagLookupPage = z.strictObject({ ...dataAsOf, items: z.array(oracleTagRow) });

export const searchCatalog = databaseFunction({
  name: 'search_catalog',
  argument: 'query',
  request: catalogQuery,
  reply: catalogPage,
  errorCodes: ['invalid_argument', 'invalid_cursor', 'data_unavailable'],
});

export const getCards = databaseFunction({
  name: 'get_cards',
  argument: 'query',
  request: cardDetailsQuery,
  reply: cardDetails,
  errorCodes: ['invalid_argument', 'data_unavailable'],
});

export const listCardPrintings = databaseFunction({
  name: 'list_card_printings',
  argument: 'query',
  request: cardPrintingsQuery,
  reply: cardPrintingsPage,
  errorCodes: ['invalid_argument', 'invalid_cursor', 'not_found', 'data_unavailable'],
});

export const searchOracleTags = databaseFunction({
  name: 'search_oracle_tags',
  argument: 'query',
  request: tagLookupQuery,
  reply: tagLookupPage,
  errorCodes: ['invalid_argument', 'data_unavailable'],
});

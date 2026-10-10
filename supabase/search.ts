import type { Database } from './database.types';

export type Color = 'W' | 'U' | 'B' | 'R' | 'G';

export type Rarity = Database['public']['Enums']['card_rarity'];

export type CatalogSort = 'relevance' | 'name' | 'mana_value' | 'edhrec_rank' | 'price' | 'release_date';

export type PriceCurrency = Database['public']['Enums']['price_currency'];

export type Finish = Database['public']['Enums']['card_finish'];

export type CatalogQuery = {
  text?: string;
  names?: string[];
  names_exclude?: string[];
  types?: string[];
  types_exclude?: string[];
  colors?: (Color | 'C')[];
  colors_exclude?: (Color | 'C')[];
  identity_subset_of?: Color[];
  mana_value_min?: number;
  mana_value_max?: number;
  power_min?: number;
  power_max?: number;
  toughness_min?: number;
  toughness_max?: number;
  price_min?: string;
  price_max?: string;
  price_currency?: PriceCurrency;
  keywords?: string[];
  keywords_exclude?: string[];
  sets?: string[];
  sets_exclude?: string[];
  rarities?: Rarity[];
  rarities_exclude?: Rarity[];
  tags?: string[];
  tags_exclude?: string[];
  is_commander?: boolean;
  is_game_changer?: boolean;
  include_oracle_text?: boolean;
  sort?: CatalogSort;
  sort_order?: 'asc' | 'desc';
  limit?: number;
  cursor?: string | null;
};

export type SearchPage<Row> = {
  items: Row[];
  next_cursor: string | null;
  search_id: string;
  rules_data_as_of: string;
  rules_stale: boolean;
  prices_observed_at: string | null;
  prices_stale: boolean;
};

export type PriceFrom = {
  currency: PriceCurrency;
  amount: string;
  finish: Finish;
  basis: 'lowest current price over printings and finishes';
};

export type OwnedCopies = { quantity: number; free_quantity: number; protected_free_quantity: number };

export type CatalogRow = {
  oracle_id: string;
  name: string;
  mana_cost: string;
  mana_value: number;
  type_line: string;
  color_identity: string[];
  is_game_changer: boolean;
  can_be_commander: boolean;
  edhrec_rank: number | null;
  oracle_text?: string;
  price_from: PriceFrom | null;
  owned: OwnedCopies;
};

export type CommanderLegality = Database['public']['Enums']['commander_legality'];

export type DataAsOf = {
  rules_data_as_of: string;
  rules_stale: boolean;
};

export type CardDetailsQuery = { oracle_ids: string[]; printing_ids?: never } | { printing_ids: string[]; oracle_ids?: never };

export type CardFace = {
  name: string;
  mana_cost: string;
  type_line: string;
  oracle_text: string;
  colors: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
};

export type CardDetailsPrinting = {
  printing_id: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: Rarity;
  finishes: Finish[];
  released_at: string;
};

export type CardDetailsRow = {
  oracle_id: string;
  name: string;
  mana_cost: string;
  mana_value: number;
  type_line: string;
  oracle_text: string;
  colors: string[];
  color_identity: string[];
  keywords: string[];
  faces: CardFace[];
  commander_legality: CommanderLegality;
  can_be_commander: boolean;
  is_game_changer: boolean | null;
  edhrec_rank: number | null;
  released_at: string;
  printing_count: number;
  price_from: PriceFrom | null;
  owned: OwnedCopies;
  printing?: CardDetailsPrinting;
};

export type CardDetails = DataAsOf & {
  items: CardDetailsRow[];
  not_found: string[];
  prices_observed_at: string | null;
  prices_stale: boolean;
};

export type CardPrintingsQuery = {
  oracle_id: string;
  owned_only?: boolean;
  limit?: number;
  cursor?: string | null;
};

export type CardPrintingRow = CardDetailsPrinting & {
  image_uris: string[];
  owned_quantity: number;
};

export type CardPrintingsPage = DataAsOf & {
  items: CardPrintingRow[];
  next_cursor: string | null;
};

export type TagLookupQuery = {
  text: string;
  limit?: number;
};

export type OracleTagRow = {
  id: string;
  slug: string;
  label: string;
  aliases: string[];
  description: string | null;
  parent_slugs: string[];
  card_count: number;
};

export type TagLookupPage = {
  items: OracleTagRow[];
  rules_data_as_of: string;
  rules_stale: boolean;
};

export type SearchErrorCode = 'invalid_argument' | 'invalid_cursor' | 'not_found' | 'data_unavailable';

export type SearchError = {
  code: SearchErrorCode;
  message: string;
  field: string | null;
};

export function readSearchError(error: { code: string; message: string; details: string | null }): SearchError {
  return { code: error.code as SearchErrorCode, message: error.message, field: error.details || null };
}

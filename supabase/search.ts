export type Color = 'W' | 'U' | 'B' | 'R' | 'G';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'mythic' | 'special' | 'bonus';

export type CatalogSort = 'relevance' | 'name' | 'mana_value' | 'edhrec_rank' | 'release_date';

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
  keywords?: string[];
  keywords_exclude?: string[];
  sets?: string[];
  sets_exclude?: string[];
  rarities?: Rarity[];
  rarities_exclude?: Rarity[];
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
  price_from: null;
  owned: { quantity: number; free_quantity: number; protected_free_quantity: number };
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

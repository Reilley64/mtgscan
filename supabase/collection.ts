import type { Database } from './database.types';
import {
  readSearchError,
  type CatalogQuery,
  type CatalogSort,
  type CommanderLegality,
  type ExchangeRateFields,
  type Finish,
  type PriceCurrency,
  type PriceFrom,
  type SearchError,
  type SearchPage,
} from './search';

export type CardCondition = Database['public']['Enums']['card_condition'];

export type CardLanguage = Database['public']['Enums']['card_language'];

export type CardRarity = Database['public']['Enums']['card_rarity'];

export type CollectionSort = CatalogSort | 'added';

export type CollectionQuery = Omit<CatalogQuery, 'sort'> & {
  rows?: 'entries' | 'copies';
  sort?: CollectionSort;
  finishes?: Finish[];
  finishes_exclude?: Finish[];
  conditions?: CardCondition[];
  conditions_exclude?: CardCondition[];
  languages?: CardLanguage[];
  languages_exclude?: CardLanguage[];
  deck_ids?: string[];
  deck_ids_exclude?: string[];
  is_free?: boolean;
  is_protected?: boolean;
  user_tags?: string[];
  user_tags_exclude?: string[];
};

export type CollectionPage<Row> = SearchPage<Row> & {
  total_count: number | null;
};

export type CollectionRow = {
  oracle_id: string;
  printing_id: string;
  name: string;
  set: string;
  collector_number: string;
  finish: Finish;
  language: CardLanguage;
  condition: CardCondition;
  protected: boolean;
  quantity: number;
  free_quantity: number;
  allocated_quantity: number;
  held_quantity: number;
  commander_legal: boolean;
  oracle_text?: string;
};

export type ScanBatchStack = {
  card_printing_id: string;
  finish: Finish;
  condition: CardCondition;
  language: CardLanguage;
  copy_ids: string[];
};

export type ScanBatch = {
  items: ScanBatchStack[];
};

export type ScanBatchResultItem = Omit<ScanBatchStack, 'copy_ids'> & {
  quantity_added: number;
};

export type ScanBatchResultCopy = {
  copy_id: string;
  addition_id: string;
  replayed: boolean;
};

export type ScanBatchResult = {
  addition_id: string | null;
  added_at: string | null;
  copy_count: number;
  items: ScanBatchResultItem[];
  copies: ScanBatchResultCopy[];
};

export type CurrentPrice = Omit<PriceFrom, 'basis'> & { stale: boolean };

export type CollectionCopyRow = {
  copy_id: string;
  printing_id: string;
  name: string;
  set: string;
  collector_number: string;
  rarity: CardRarity;
  image_uris: string[];
  finish: Finish;
  condition: CardCondition;
  language: CardLanguage;
  protected: boolean;
  price: CurrentPrice | null;
};

export type CopyQuery = {
  copy_id: string;
  price_currency?: PriceCurrency;
};

export type CopyProtectedRequest = {
  copy_id: string;
  protected: boolean;
};

export type DeleteCopyRequest = {
  copy_id: string;
};

export type CopyFace = {
  name: string;
  oracle_text: string;
};

export const userTagNameLength = 64;

export type UserTag = {
  user_tag_id: string;
  name: string;
};

export type UserTagRow = UserTag & {
  copy_count: number;
};

export type UserTagList = {
  items: UserTagRow[];
};

export type CreateUserTagRequest = {
  name: string;
};

export type RenameUserTagRequest = {
  user_tag_id: string;
  name: string;
};

export type DeleteUserTagRequest = {
  user_tag_id: string;
};

export type CopyUserTagRequest = {
  copy_id: string;
  user_tag_id: string;
  tagged: boolean;
};

export type CopyDetails = CollectionCopyRow & {
  art_crop_uri: string | null;
  free: boolean;
  added_at: string;
  purchase_day_price: Omit<CurrentPrice, 'stale'> | null;
  type_line: string;
  faces: CopyFace[];
  commander_legality: CommanderLegality;
  user_tags: UserTag[];
};

export type CollectionTotalQuery = {
  price_currency?: PriceCurrency;
};

export type CollectionTotal = ExchangeRateFields & {
  total: string;
  currency: PriceCurrency;
  priced_copies: number;
  copies: number;
  stale: boolean;
  prices_observed_at: string | null;
};

export type ScanBatchErrorCode = 'invalid_argument' | 'unknown_printing' | 'basic_land';

export type ScanBatchError = Omit<SearchError, 'code'> & { code: ScanBatchErrorCode };

export function readScanBatchError(error: Parameters<typeof readSearchError>[0]): ScanBatchError {
  return { ...readSearchError(error), code: error.code as ScanBatchErrorCode };
}

export type UserTagErrorCode = 'invalid_argument' | 'not_found' | 'user_tag_exists';

export type UserTagError = Omit<SearchError, 'code'> & { code: UserTagErrorCode };

export function readUserTagError(error: Parameters<typeof readSearchError>[0]): UserTagError {
  return { ...readSearchError(error), code: error.code as UserTagErrorCode };
}

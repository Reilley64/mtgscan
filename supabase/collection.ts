import type { Database } from './database.types';
import { readSearchError, type CatalogQuery, type Finish, type PriceCurrency, type PriceFrom, type SearchError } from './search';

export type CardCondition = Database['public']['Enums']['card_condition'];

export type CardLanguage = Database['public']['Enums']['card_language'];

export type CardRarity = Database['public']['Enums']['card_rarity'];

export type CollectionQuery = CatalogQuery & {
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

export type CollectionCopiesQuery = {
  limit?: number;
  cursor?: string | null;
  price_currency?: PriceCurrency;
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

export type CollectionCopiesPage = {
  items: CollectionCopyRow[];
  next_cursor: string | null;
};

export type CollectionTotalQuery = {
  price_currency?: PriceCurrency;
};

export type CollectionTotal = {
  total: string;
  currency: PriceCurrency;
  priced_copies: number;
  copies: number;
  change: string | null;
};

export type ScanBatchErrorCode = 'invalid_argument' | 'unknown_printing' | 'basic_land';

export type ScanBatchError = Omit<SearchError, 'code'> & { code: ScanBatchErrorCode };

export function readScanBatchError(error: Parameters<typeof readSearchError>[0]): ScanBatchError {
  return { ...readSearchError(error), code: error.code as ScanBatchErrorCode };
}

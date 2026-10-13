import type { Database } from './database.types';
import { readSearchError, type CatalogQuery, type Finish, type SearchError } from './search';

export type CardCondition = Database['public']['Enums']['card_condition'];

export type CardLanguage = Database['public']['Enums']['card_language'];

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
  collection_entry_id: string;
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
  collection_entry_id: string | null;
  quantity_added: number;
  entry_quantity: number;
};

export type ScanBatchResultCopy = {
  copy_id: string;
  addition_id: string;
  collection_entry_id: string | null;
  replayed: boolean;
};

export type ScanBatchResult = {
  addition_id: string | null;
  added_at: string | null;
  copy_count: number;
  items: ScanBatchResultItem[];
  copies: ScanBatchResultCopy[];
};

export type CollectionPrintingsQuery = {
  limit?: number;
  cursor?: string | null;
};

export type CollectionPrintingRow = {
  printing_id: string;
  name: string;
  set: string;
  collector_number: string;
  image_uris: string[];
  owned_quantity: number;
  latest_addition_at: string;
};

export type CollectionPrintingsPage = {
  items: CollectionPrintingRow[];
  next_cursor: string | null;
};

export type ScanBatchErrorCode = 'invalid_argument' | 'unknown_printing' | 'basic_land';

export type ScanBatchError = Omit<SearchError, 'code'> & { code: ScanBatchErrorCode };

export function readScanBatchError(error: Parameters<typeof readSearchError>[0]): ScanBatchError {
  return { ...readSearchError(error), code: error.code as ScanBatchErrorCode };
}

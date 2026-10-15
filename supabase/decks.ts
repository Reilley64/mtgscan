import type { CollectionCopyRow } from './collection';
import type { Database } from './database.types';
import { readSearchError, type SearchError } from './search';

export type DeckPriority = Database['public']['Enums']['deck_priority'];

export type DeckRole = Database['public']['Enums']['deck_role'];

export const deckNameLength = 64;

export type DeckCommander = {
  copy_id: string;
  name: string;
  art_crop_uri: string | null;
};

export type DeckRow = {
  deck_id: string;
  name: string;
  priority: DeckPriority;
  card_count: number;
  commanders: DeckCommander[];
  last_used_at: string;
};

export type DeckList = {
  items: DeckRow[];
};

export type DeckCard = Omit<CollectionCopyRow, 'deck'> & {
  role: DeckRole;
  commander_at: string | null;
  added_at: string;
  type_line: string;
  mana_value: number;
  colors: string[];
};

export type DeckBasicLand = {
  oracle_id: string | null;
  name: string;
  image_uris: string[];
  count: number;
};

export type Deck = DeckRow & {
  revision: number;
  created_at: string;
  cards: DeckCard[];
  basic_lands: DeckBasicLand[];
};

export type CopyRowDeck = {
  deck_id: string;
  name: string;
};

export type CopyDeck = CopyRowDeck & {
  role: DeckRole;
  commander_art_crop_uri: string | null;
  commander_count: number;
};

export type DeckChangeKind = Database['public']['Enums']['deck_change_kind'];

export type DeckChangesQuery = {
  deck_id: string;
  cursor?: string | null;
  limit?: number;
};

export type DeckChangeCopyLine = {
  kind: 'copy';
  copy_id: string;
  name: string;
  image_uris: string[];
  type_line: string;
  place_before: DeckRole | null;
  place_after: DeckRole | null;
};

export type DeckChangeBasicLandLine = {
  kind: 'basic_land';
  oracle_id: string;
  name: string;
  image_uris: string[];
  count_before: number;
  count_after: number;
};

export type DeckChangeLine = DeckChangeCopyLine | DeckChangeBasicLandLine;

export type DeckChange = {
  deck_change_id: string;
  revision: number;
  kind: DeckChangeKind;
  changed_at: string;
  reverted: boolean;
  lines: DeckChangeLine[];
};

export type DeckChangePage = {
  items: DeckChange[];
  next_cursor: string | null;
};

export type CreateDeckRequest = {
  name: string;
};

export type CreatedDeck = {
  deck_id: string;
};

export type DeckQuery = {
  deck_id: string;
};

export type MarkDeckUsedRequest = {
  deck_id: string;
};

export type RenameDeckRequest = {
  deck_id: string;
  name: string;
};

export type SetDeckPriorityRequest = {
  deck_id: string;
  priority: DeckPriority;
};

export type DeleteDeckRequest = {
  deck_id: string;
};

export type AddDeckCardRequest = {
  deck_id: string;
  copy_id: string;
  unprotect: boolean;
};

export type AddedDeckCard = {
  deck_id: string;
  revision: number;
};

export type SetDeckCommanderRequest = {
  copy_id: string;
  commander: boolean;
};

export type SetDeckCommanderResult = AddedDeckCard;

export type BasicLandCount = {
  oracle_id: string;
  count: number;
};

export type SetBasicLandsRequest = {
  deck_id: string;
  counts: BasicLandCount[];
};

export type SetBasicLandsResult = AddedDeckCard;

export type RemoveDeckCardRequest = {
  copy_id: string;
};

export type RemovedDeckCard = AddedDeckCard;

export type DeckErrorCode =
  | 'invalid_argument'
  | 'invalid_cursor'
  | 'not_found'
  | 'copy_not_free'
  | 'copy_protected'
  | 'copy_not_in_deck'
  | 'commander_limit';

export type DeckError = Omit<SearchError, 'code'> & { code: DeckErrorCode };

export function readDeckError(error: Parameters<typeof readSearchError>[0]): DeckError {
  return { ...readSearchError(error), code: error.code as DeckErrorCode };
}

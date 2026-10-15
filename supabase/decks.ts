import type { Database } from './database.types';
import { readSearchError, type SearchError } from './search';

export type DeckPriority = Database['public']['Enums']['deck_priority'];

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

export type Deck = DeckRow & {
  revision: number;
  created_at: string;
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

export type DeckErrorCode = 'invalid_argument' | 'not_found';

export type DeckError = Omit<SearchError, 'code'> & { code: DeckErrorCode };

export function readDeckError(error: Parameters<typeof readSearchError>[0]): DeckError {
  return { ...readSearchError(error), code: error.code as DeckErrorCode };
}

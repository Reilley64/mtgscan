import type { CollectionCopyRow } from './collection';
import type { Database } from './database.types';
import type { DeckChangeEffect, DeckPriority } from './decks';
import type { CloseNote, PlannedCopyLine } from './planned-swaps';

export type BuylistCardStatus = Database['public']['Enums']['buylist_card_status'];

export type PlannedCardLine = {
  kind: 'card';
  oracle_id: string;
  name: string;
  image_uris: string[];
  type_line: string;
};

export type BuylistCard = {
  buylist_card_id: string;
  deck_id: string;
  deck_name: string;
  commander_art_crop_uri: string | null;
  incoming: PlannedCardLine;
  outgoing: PlannedCopyLine | null;
  as_commander: boolean;
  reason: string;
  status: BuylistCardStatus;
  close_note: CloseNote | null;
  client_name: string | null;
  created_at: string;
  status_changed_at: string;
  effect: DeckChangeEffect | null;
};

export type BuylistQuery = {
  deck_id?: string;
  status?: BuylistCardStatus;
  order?: 'newest_first' | 'oldest_first';
  cursor?: string | null;
  limit?: number;
};

export type BuylistPage = {
  items: BuylistCard[];
  next_cursor: string | null;
};

export type BuylistCardInput = {
  ref: string;
  deck_id: string;
  expected_deck_revision: number;
  incoming: { oracle_id: string; as_commander?: boolean };
  outgoing?: { copy_id: string };
  reason: string;
};

export type BuylistCardWarning =
  | { code: 'would_break_validity'; effect: DeckChangeEffect }
  | { code: 'in_other_decks'; decks: { deck_id: string; name: string; priority: DeckPriority }[] }
  | { code: 'replaces_commander' | 'rules_stale' | 'protected_only' };

export type CreatedBuylistCards = {
  buylist_cards: { ref: string; buylist_card_id: string; warnings: BuylistCardWarning[] }[];
  replayed: boolean;
};

export type MarkBuylistCardBoughtRequest = {
  buylist_card_id: string;
  copy_id: string;
  unprotect: boolean;
};

export type CloseBuylistCardRequest = {
  buylist_card_id: string;
};

export type ClosedBuylistCard = {
  id: string;
  changed: boolean;
};

export type FreeCopiesQuery = {
  oracle_id: string;
};

export type FreeCopy = Omit<CollectionCopyRow, 'deck' | 'held_for' | 'oracle_text'>;

export type FreeCopies = {
  items: FreeCopy[];
};

import type { CardCondition } from './collection';
import type { Database } from './database.types';
import type { DeckChangeEffect } from './decks';
import type { Finish } from './search';

type PlannedSwapStatus = Database['public']['Enums']['planned_swap_status'];

export type CloseNote = Database['public']['Enums']['close_note'];

export type PlannedCopyLine = {
  kind: 'copy';
  copy_id: string;
  name: string;
  image_uris: string[];
  type_line: string;
  set: string | null;
  collector_number: string | null;
  finish: Finish | null;
  condition: CardCondition | null;
};

export type PlannedBasicLandLine = {
  kind: 'basic_land';
  oracle_id: string;
  name: string;
  image_uris: string[];
};

export type PlannedOutgoingLine = PlannedCopyLine | PlannedBasicLandLine;

export type PlannedSwap = {
  planned_swap_id: string;
  deck_id: string;
  deck_name: string;
  commander_art_crop_uri: string | null;
  incoming: PlannedCopyLine | PlannedBasicLandLine;
  outgoing: PlannedOutgoingLine | null;
  as_commander: boolean;
  reason: string;
  status: PlannedSwapStatus;
  close_note: CloseNote | null;
  client_name: string | null;
  created_at: string;
  status_changed_at: string;
  effect: DeckChangeEffect | null;
};

export type PlannedSwapsQuery = {
  deck_id?: string;
  status?: PlannedSwapStatus;
  order?: 'newest_first' | 'oldest_first';
  cursor?: string | null;
  limit?: number;
};

export type PlannedSwapPage = {
  items: PlannedSwap[];
  next_cursor: string | null;
};

export type PlannedSwapInput = {
  ref: string;
  deck_id: string;
  expected_deck_revision: number;
  incoming: { copy_id: string; as_commander?: boolean } | { basic_land_oracle_id: string };
  outgoing?: PlannedOutgoingInput;
  reason: string;
};

export type PlannedOutgoingInput = { copy_id: string } | { basic_land_oracle_id: string };

export type PlannedSwapWarning =
  | { code: 'would_break_validity'; effect: DeckChangeEffect }
  | { code: 'replaces_commander' | 'rules_stale' };

export type CreatedPlannedSwaps = {
  planned_swaps: { ref: string; planned_swap_id: string; warnings: PlannedSwapWarning[] }[];
  replayed: boolean;
};

export type SwapInPlannedSwapRequest = {
  planned_swap_id: string;
};

export type ClosePlannedSwapRequest = {
  planned_swap_id: string;
};

export type ClosedPlannedSwap = {
  id: string;
  changed: boolean;
};

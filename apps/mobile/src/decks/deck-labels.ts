import { Constants } from '@mtgscan/supabase/database.types';
import type { DeckPriority, DeckRow } from '@mtgscan/supabase/decks';

export const deckPriorities = Constants.public.Enums.deck_priority;

export const priorityNames: Record<DeckPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function cardCountLabel(count: number) {
  return count === 1 ? '1 card' : `${count} cards`;
}

export function deckChips(deck: Pick<DeckRow, 'priority' | 'card_count'>) {
  return [`${priorityNames[deck.priority]} priority`, cardCountLabel(deck.card_count)];
}

export function deckDetail(deck: Pick<DeckRow, 'priority' | 'card_count'>) {
  return deckChips(deck).join(' · ');
}

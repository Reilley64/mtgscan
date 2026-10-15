import type { DeckPriority, DeckRow } from '@mtgscan/supabase/decks';

const priorityLabels: Record<DeckPriority, string> = {
  high: 'High priority',
  medium: 'Medium priority',
  low: 'Low priority',
};

export function cardCountLabel(count: number) {
  return count === 1 ? '1 card' : `${count} cards`;
}

export function deckChips(deck: Pick<DeckRow, 'priority' | 'card_count'>) {
  return [priorityLabels[deck.priority], cardCountLabel(deck.card_count)];
}

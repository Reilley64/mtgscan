import { Constants } from '@mtgscan/supabase/database.types';
import type { DeckEvaluationSummary, DeckPriority, DeckRow, DeckRule, DeckValidity } from '@mtgscan/supabase/decks';
import type { SFSymbol } from 'expo-symbols';

export const deckPriorities = Constants.public.Enums.deck_priority;

export const priorityNames: Record<DeckPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export const validityChips: Record<DeckValidity, { label: string; tone: 'neutral' | 'danger' | 'warning'; symbol: SFSymbol }> = {
  valid: { label: 'Valid', tone: 'neutral', symbol: 'checkmark' },
  invalid: { label: 'Invalid', tone: 'danger', symbol: 'nosign' },
  cannot_be_determined: { label: 'Cannot be determined', tone: 'warning', symbol: 'questionmark' },
};

export const ruleNames: Record<DeckRule, string> = {
  no_commander: 'No commander',
  deck_size: 'Deck size',
};

export function cardCountLabel(count: number) {
  return count === 1 ? '1 card' : `${count} cards`;
}

export function deckChips(deck: Pick<DeckRow, 'priority' | 'card_count'>) {
  return [`${priorityNames[deck.priority]} priority`, cardCountLabel(deck.card_count)];
}

export function galleryCardChips(deck: Pick<DeckRow, 'priority' | 'card_count'> & { evaluation: DeckEvaluationSummary | null }) {
  return [...deckChips(deck).map((label) => ({ label })), ...(deck.evaluation ? [validityChips[deck.evaluation.validity]] : [])];
}

export function deckDetail(deck: Pick<DeckRow, 'priority' | 'card_count'>) {
  return deckChips(deck).join(' · ');
}

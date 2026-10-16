import { Constants } from '@mtgscan/supabase/database.types';
import type {
  BracketSignalKind,
  DeckChangeEffect,
  DeckChangeEffectRule,
  DeckEvaluationSummary,
  DeckPriority,
  DeckRow,
  DeckValidity,
  EstimatedBracket,
  UndeterminedRule,
} from '@mtgscan/supabase/decks';
import type { Color } from '@mtgscan/supabase/search';
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

export const ruleNames: Record<UndeterminedRule, string> = {
  no_commander: 'No commander',
  commander_eligibility: 'Commander eligibility',
  partner: 'Partner',
  deck_size: 'Deck size',
  singleton: 'Singleton',
  color_identity: 'Color identity',
  banned: 'Banned',
  not_legal: 'Not legal',
  legality: 'Legality',
};

export const colorNames: Record<Color, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green' };

export const bracketSignalNames: Record<BracketSignalKind, string> = {
  game_changers: 'Game Changers',
  mass_land_denial: 'Mass land denial',
  two_card_combo: 'Two-card combos',
  extra_turns: 'Extra turns',
};

export function bracketLabel(bracket: EstimatedBracket) {
  return `Bracket ${bracket}`;
}

export function estimatedBracketName(bracket: EstimatedBracket) {
  return `Estimated bracket ${bracket}`;
}

export function estimatedBracketChip(bracket: EstimatedBracket) {
  return { label: bracketLabel(bracket), tone: 'info' as const, accessibilityLabel: estimatedBracketName(bracket) };
}

const effectNames: Record<DeckChangeEffect['kind'], { chip: string; spoken: (deckName: string) => string }> = {
  would_make_invalid: { chip: 'Would make it invalid', spoken: (deckName) => `Would make ${deckName} invalid` },
  adds_violation: { chip: 'Adds a violation', spoken: (deckName) => `Adds a violation to ${deckName}` },
};

function effectRuleName({ rule }: DeckChangeEffectRule) {
  return ruleNames[rule].toLowerCase();
}

function spokenEffectRule(effectRule: DeckChangeEffectRule) {
  return [effectRuleName(effectRule), ...(effectRule.colors ?? []).map((color) => colorNames[color])].join(', ');
}

export function effectStatus(effect: DeckChangeEffect, deckName: string) {
  const { chip, spoken } = effectNames[effect.kind];
  return {
    chip: { label: chip, tone: 'danger' as const },
    spoken: `${spoken(deckName)}: ${effect.rules.map(spokenEffectRule).join(', ')}`,
  };
}

export function revertEffectChip(effect: DeckChangeEffect, deckName: string) {
  const { chip, spoken } = effectStatus(effect, deckName);
  return { ...chip, label: `${chip.label}: ${effect.rules.map(effectRuleName).join(', ')}`, accessibilityLabel: spoken };
}

export function cardCountLabel(count: number) {
  return count === 1 ? '1 card' : `${count} cards`;
}

export function deckChips(deck: Pick<DeckRow, 'priority' | 'card_count'>) {
  return [`${priorityNames[deck.priority]} priority`, cardCountLabel(deck.card_count)];
}

export function galleryCardChips(deck: Pick<DeckRow, 'priority' | 'card_count'> & { evaluation: DeckEvaluationSummary | null }) {
  return [
    ...deckChips(deck).map((label) => ({ label })),
    ...(deck.evaluation ? [validityChips[deck.evaluation.validity], estimatedBracketChip(deck.evaluation.estimated_bracket)] : []),
  ];
}

export function deckDetail(deck: Pick<DeckRow, 'priority' | 'card_count'>) {
  return deckChips(deck).join(' · ');
}

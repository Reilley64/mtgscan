import type { DeckChangeKind, RevertBlock, RevertHeldCopy } from '@mtgscan/supabase/decks';

import { deckChangeKindNames } from '@/decks/deck-change-lines';

export function undoText(kind: DeckChangeKind, laterChangeCount: number, deckName: string) {
  const undone = `Undo "${deckChangeKindNames[kind]}"`;
  if (laterChangeCount === 0) {
    return `${undone} as one new change.`;
  }
  const later = laterChangeCount === 1 ? 'the 1 later change' : `the ${laterChangeCount} later changes`;
  return `${undone} and ${later} in ${deckName} as one new change.`;
}

export function blockMessage(block: RevertBlock) {
  return block.deck ? `${block.name} is in ${block.deck.name}.` : `${block.name} is no longer in your collection.`;
}

export function protectedCopyMessage(name: string) {
  return `${name} is protected. Reverting unprotects it.`;
}

export function heldCopyMessage({ name, deck }: RevertHeldCopy) {
  return `${name} is held by the planned swap for ${deck.name}. Reverting moves that swap to the buylist.`;
}

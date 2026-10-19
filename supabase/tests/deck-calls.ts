import { expect } from 'bun:test';

import { createDeck, getDeck, type Deck } from '../decks';
import { replyOf } from './database-calls';
import type { TestUser } from './local-stack';

export async function createdDeck(user: TestUser, name = 'Atraxa') {
  return (await replyOf(user.client, createDeck, { name })).deck_id;
}

export async function deckOf(user: TestUser, deckId: string): Promise<Deck> {
  return replyOf(user.client, getDeck, { deck_id: deckId });
}

export async function deckChangesOf(user: TestUser, deckId: string) {
  const { data, error } = await user.client
    .from('deck_changes')
    .select('revision, kind, deck_change_lines(copy_id, card_printing_id, finish, place_before, place_after)')
    .eq('deck_id', deckId)
    .order('revision');
  expect(error).toBeNull();
  return data!;
}

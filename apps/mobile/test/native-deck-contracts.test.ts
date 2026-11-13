import { getDeck, listDecks } from '@mtgscan/supabase/decks';

import deckFixture from '../../../crates/api/fixtures/deck.json';
import galleryFixture from '../../../crates/api/fixtures/decks.json';

test('native deck replies preserve the canonical deck projections, exact copies, basic-land counts, and stored evaluation', () => {
  const deck = getDeck.reply.parse(deckFixture);
  const gallery = listDecks.reply.parse(galleryFixture);

  expect(deck.deck_id).toBe('40000000-0000-4000-8000-000000000001');
  expect(deck.revision).toBe(7);
  expect(deck.card_count).toBe(9);
  expect(deck.cards).toHaveLength(1);
  expect(deck.cards[0].copy_id).toBe('10000000-0000-4000-8000-000000000001');
  expect(deck.basic_lands[0].count).toBe(8);
  expect(deck.basic_lands[1].oracle_id).toBeNull();
  expect(deck.evaluation?.violations[0].message).toBe('Sol Ring cannot be a commander.');
  expect(deck.evaluation?.validity_stale).toBe(true);
  expect(gallery.items[0].needs_you_count).toBe(2);
  expect(gallery.items[0].commanders[0].copy_id).toBe(deck.cards[0].copy_id);
  expect(gallery.items[0].priority).toBe('high');
});

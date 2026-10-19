import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { Deck } from '@mtgscan/supabase/decks';

import { databaseRead, useScreenRead } from '@/lib/read';

function loadedDeck(deck: Deck) {
  return { deck };
}

export function useDeck(deckId: string) {
  return useScreenRead(databaseRead(databaseFunctions.get_deck, { deck_id: deckId }), loadedDeck);
}

import type { Deck, DeckQuery } from '@mtgscan/supabase/decks';
import { useMemo } from 'react';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type DeckRead = { status: 'loaded'; deck: Deck };

async function readDeck(deckId: string): Promise<DeckRead> {
  const query: DeckQuery = { deck_id: deckId };
  const { data, error } = await supabase.rpc('get_deck', { query });
  if (error) {
    throw error;
  }
  return { status: 'loaded', deck: data as unknown as Deck };
}

export function useDeck(deckId: string) {
  const readOnce = useMemo(() => () => readDeck(deckId), [deckId]);
  return useFocusedRead(readOnce);
}

import type { Deck } from '@mtgscan/supabase/decks';
import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import { useMemo } from 'react';

import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type DeckRead = { status: 'loaded'; deck: Deck };

async function readDeck(deckId: string): Promise<DeckRead> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.get_deck, { deck_id: deckId });
  return { status: 'loaded', deck: replyOf(result) };
}

export function useDeck(deckId: string) {
  const readOnce = useMemo(() => () => readDeck(deckId), [deckId]);
  return useFocusedRead(readOnce);
}

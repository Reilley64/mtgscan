import type { DeckList, DeckRow } from '@mtgscan/supabase/decks';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type DecksRead = { status: 'loaded'; decks: DeckRow[] };

export async function readDecks(): Promise<DecksRead> {
  const { data, error } = await supabase.rpc('list_decks');
  if (error) {
    throw error;
  }
  return { status: 'loaded', decks: (data as unknown as DeckList).items };
}

export function useDecks(needed = true) {
  return useFocusedRead(needed ? readDecks : null);
}

import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { DeckRow } from '@mtgscan/supabase/decks';

import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type DecksRead = { status: 'loaded'; decks: DeckRow[] };

export async function readDecks(): Promise<DecksRead> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.list_decks);
  return { status: 'loaded', decks: replyOf(result).items };
}

export function useDecks(needed = true) {
  return useFocusedRead(needed ? readDecks : null);
}

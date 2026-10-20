import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { DeckRow } from '@mtgscan/supabase/decks';

import { databaseRead, useScreenRead } from '@/lib/read';

export const decksRead = databaseRead(databaseFunctions.list_decks);

function loadedDecks({ items }: { items: DeckRow[] }) {
  return { decks: items };
}

export function useDecks(needed = true) {
  return useScreenRead(needed ? decksRead : null, loadedDecks);
}

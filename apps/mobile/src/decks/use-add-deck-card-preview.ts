import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { AddDeckCardPreview, AddDeckCardPreviewQuery } from '@mtgscan/supabase/decks';

import { databaseRead, useScreenRead } from '@/lib/read';

function loadedPreview(preview: AddDeckCardPreview) {
  return { preview };
}

export function useAddDeckCardPreview(query: AddDeckCardPreviewQuery) {
  return useScreenRead(databaseRead(databaseFunctions.preview_add_deck_card, query), loadedPreview, { keepsShown: true });
}

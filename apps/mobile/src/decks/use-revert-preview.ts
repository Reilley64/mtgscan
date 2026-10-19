import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { RevertPreview } from '@mtgscan/supabase/decks';

import { databaseRead, useScreenRead } from '@/lib/read';

function loadedPreview(preview: RevertPreview) {
  return { status: 'loaded' as const, preview };
}

export function useRevertPreview(deckId: string, deckChangeId: string) {
  return useScreenRead(databaseRead(databaseFunctions.preview_revert, { deck_id: deckId, deck_change_id: deckChangeId }), loadedPreview);
}

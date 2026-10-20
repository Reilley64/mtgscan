import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { pagedDatabaseRead, usePagedScreenRead } from '@/lib/read';

export function useDeckChanges(deckId: string, revision: number | null) {
  const { read, reload, loadMore } = usePagedScreenRead(
    revision === null ? null : pagedDatabaseRead(databaseFunctions.list_deck_changes, { deck_id: deckId }),
    { key: [revision], keepsShown: true },
  );
  return { history: read, tryAgain: reload, loadMore };
}

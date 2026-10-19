import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { RevertPreview, RevertPreviewQuery } from '@mtgscan/supabase/decks';
import { useMemo } from 'react';

import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type RevertPreviewRead = { status: 'loaded'; preview: RevertPreview };

async function readRevertPreview(query: RevertPreviewQuery): Promise<RevertPreviewRead> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.preview_revert, query);
  return { status: 'loaded', preview: replyOf(result) };
}

export function useRevertPreview(deckId: string, deckChangeId: string) {
  const readOnce = useMemo(() => () => readRevertPreview({ deck_id: deckId, deck_change_id: deckChangeId }), [deckId, deckChangeId]);
  return useFocusedRead(readOnce);
}

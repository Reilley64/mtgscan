import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { AddDeckCardPreview, AddDeckCardPreviewQuery } from '@mtgscan/supabase/decks';
import { useMemo } from 'react';

import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type AddDeckCardPreviewRead = { status: 'loaded'; preview: AddDeckCardPreview };

async function readAddDeckCardPreview(query: AddDeckCardPreviewQuery): Promise<AddDeckCardPreviewRead> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.preview_add_deck_card, query);
  return { status: 'loaded', preview: replyOf(result) };
}

export function useAddDeckCardPreview(query: AddDeckCardPreviewQuery) {
  const queryKey = JSON.stringify(query);
  const readOnce = useMemo(() => () => readAddDeckCardPreview(JSON.parse(queryKey)), [queryKey]);
  return useFocusedRead(readOnce);
}

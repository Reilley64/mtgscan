import type { RevertPreview, RevertPreviewQuery } from '@mtgscan/supabase/decks';
import { useMemo } from 'react';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type RevertPreviewRead = { status: 'loaded'; preview: RevertPreview };

async function readRevertPreview(query: RevertPreviewQuery): Promise<RevertPreviewRead> {
  const { data, error } = await supabase.rpc('preview_revert', { query });
  if (error) {
    throw error;
  }
  return { status: 'loaded', preview: data as unknown as RevertPreview };
}

export function useRevertPreview(deckId: string, deckChangeId: string) {
  const readOnce = useMemo(() => () => readRevertPreview({ deck_id: deckId, deck_change_id: deckChangeId }), [deckId, deckChangeId]);
  return useFocusedRead(readOnce);
}

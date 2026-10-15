import type { AddDeckCardPreview, AddDeckCardPreviewQuery } from '@mtgscan/supabase/decks';
import { useMemo } from 'react';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type AddDeckCardPreviewRead = { status: 'loaded'; preview: AddDeckCardPreview };

async function readAddDeckCardPreview(query: AddDeckCardPreviewQuery): Promise<AddDeckCardPreviewRead> {
  const { data, error } = await supabase.rpc('preview_add_deck_card', { query });
  if (error) {
    throw error;
  }
  return { status: 'loaded', preview: data as unknown as AddDeckCardPreview };
}

export function useAddDeckCardPreview(copyId: string) {
  const readOnce = useMemo(() => () => readAddDeckCardPreview({ copy_id: copyId }), [copyId]);
  return useFocusedRead(readOnce);
}

import type { CopyDetails, CopyQuery } from '@mtgscan/supabase/collection';
import { readSearchError, type PriceCurrency } from '@mtgscan/supabase/search';
import { useCallback } from 'react';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type CopyRead = { status: 'failed' } | { status: 'missing' } | { status: 'loaded'; copy: CopyDetails };

export const copyPriceCurrency: PriceCurrency = 'USD';

async function readCopy(copyId: string): Promise<CopyRead> {
  const query: CopyQuery = { copy_id: copyId, price_currency: copyPriceCurrency };
  const { data, error } = await supabase.rpc('get_copy', { query });
  if (error) {
    return readSearchError(error).code === 'not_found' ? { status: 'missing' } : { status: 'failed' };
  }
  return { status: 'loaded', copy: data as unknown as CopyDetails };
}

export function useCopy(copyId: string) {
  return useFocusedRead(useCallback(() => readCopy(copyId), [copyId]));
}

import type { CopyDetails, CopyQuery } from '@mtgscan/supabase/collection';
import { readSearchError, type PriceCurrency } from '@mtgscan/supabase/search';
import { useMemo } from 'react';

import { usePriceCurrency } from '@/collection/price-currency-setting';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type CopyRead = { status: 'failed' } | { status: 'missing' } | { status: 'loaded'; copy: CopyDetails; currency: PriceCurrency };

async function readCopy(copyId: string, currency: PriceCurrency): Promise<CopyRead> {
  const query: CopyQuery = { copy_id: copyId, price_currency: currency };
  const { data, error } = await supabase.rpc('get_copy', { query });
  if (error) {
    return readSearchError(error).code === 'not_found' ? { status: 'missing' } : { status: 'failed' };
  }
  return { status: 'loaded', copy: data as unknown as CopyDetails, currency };
}

export function useCopy(copyId: string) {
  const currency = usePriceCurrency().currency?.currency;
  const readOnce = useMemo(() => (currency ? () => readCopy(copyId, currency) : null), [copyId, currency]);
  return useFocusedRead(readOnce);
}

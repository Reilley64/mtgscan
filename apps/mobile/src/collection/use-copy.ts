import type { CopyDetails, CopyQuery } from '@mtgscan/supabase/collection';
import { readSearchError, type PriceCurrency } from '@mtgscan/supabase/search';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

type CopyRead =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'missing' }
  | { status: 'loaded'; copy: CopyDetails };

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
  const [read, setRead] = useState<CopyRead>({ status: 'loading' });
  const latestRead = useRef(0);

  const reload = useCallback(() => {
    const thisRead = ++latestRead.current;
    setRead((current) => (current.status === 'failed' ? { status: 'loading' } : current));
    readCopy(copyId).then(
      (next) => thisRead === latestRead.current && setRead(next),
      () => thisRead === latestRead.current && setRead({ status: 'failed' }),
    );
  }, [copyId]);

  useFocusEffect(reload);

  return { read, reload };
}

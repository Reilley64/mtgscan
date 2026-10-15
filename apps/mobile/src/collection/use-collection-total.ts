import type { CollectionTotal, CollectionTotalQuery } from '@mtgscan/supabase/collection';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { usePriceCurrency } from '@/collection/price-currency-setting';
import { supabase } from '@/lib/supabase';

export function useCollectionTotal() {
  const currency = usePriceCurrency().priceCurrency?.currency;
  const [total, setTotal] = useState<CollectionTotal | null>(null);
  const latestRead = useRef(0);

  const reload = useCallback(() => {
    if (!currency) {
      return;
    }
    const read = ++latestRead.current;
    const query: CollectionTotalQuery = { price_currency: currency };
    supabase.rpc('get_collection_total', { query }).then(({ data, error }) => {
      if (read === latestRead.current && !error) {
        setTotal(data as unknown as CollectionTotal);
      }
    });
  }, [currency]);

  useFocusEffect(reload);

  return total?.currency === currency ? total : null;
}

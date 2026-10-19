import type { CollectionTotal } from '@mtgscan/supabase/collection';
import { convertedPrice, type ExchangeRate } from '@mtgscan/supabase/converted-prices';
import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { usePriceCurrency } from '@/collection/price-currency-setting';
import type { ConvertedCollectionTotal } from '@/collection/total-labels';
import { supabase } from '@/lib/supabase';

function convertedTotal(total: CollectionTotal, rate: ExchangeRate): ConvertedCollectionTotal {
  const { amount, ...converted } = convertedPrice({ amount: total.total, currency: total.currency, stale: total.stale }, rate);
  return { ...total, ...converted, total: amount };
}

export function useCollectionTotal() {
  const { priceCurrency } = usePriceCurrency();
  const [total, setTotal] = useState<CollectionTotal | null>(null);
  const latestRead = useRef(0);

  const reload = useCallback(() => {
    const read = ++latestRead.current;
    callDatabaseFunction(supabase, databaseFunctions.get_collection_total, {}).then((result) => {
      if (read === latestRead.current && result.status === 'replied') {
        setTotal(result.reply);
      }
    });
  }, []);

  useFocusEffect(reload);

  return total && priceCurrency ? convertedTotal(total, priceCurrency) : null;
}

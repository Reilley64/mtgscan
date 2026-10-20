import type { CollectionTotal } from '@mtgscan/supabase/collection';
import { convertedPrice, type ExchangeRate } from '@mtgscan/supabase/converted-prices';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { usePriceCurrency } from '@/collection/price-currency-setting';
import type { ConvertedCollectionTotal } from '@/collection/total-labels';
import { databaseRead, useScreenRead } from '@/lib/read';

const collectionTotalRead = databaseRead(databaseFunctions.get_collection_total, {});

function convertedTotal(total: CollectionTotal, rate: ExchangeRate): ConvertedCollectionTotal {
  const { amount, ...converted } = convertedPrice({ amount: total.total, currency: total.currency, stale: total.stale }, rate);
  return { ...total, ...converted, total: amount };
}

function loadedTotal(total: CollectionTotal) {
  return { total };
}

export function useCollectionTotal() {
  const { priceCurrency } = usePriceCurrency();
  const { read } = useScreenRead(collectionTotalRead, loadedTotal);
  return read.status === 'loaded' && priceCurrency ? convertedTotal(read.total, priceCurrency) : null;
}

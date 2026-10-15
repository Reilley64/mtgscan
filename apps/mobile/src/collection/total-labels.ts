import type { CollectionTotal } from '@mtgscan/supabase/collection';
import type { ConversionFields } from '@mtgscan/supabase/converted-prices';

import { shownPrice, spokenPrice } from '@/collection/price-currency-labels';
import { shownRateDay } from '@/lib/shown-day';

export type ConvertedCollectionTotal = CollectionTotal & ConversionFields;

function shownCount(count: number) {
  return new Intl.NumberFormat('en-US').format(count);
}

export function shownTotal({ total, currency }: ConvertedCollectionTotal) {
  return shownPrice({ amount: total, currency });
}

export function spokenTotal({ total, currency, approximate }: ConvertedCollectionTotal) {
  return spokenPrice({ amount: total, currency, approximate });
}

export function shownCoverage({ priced_copies, copies }: CollectionTotal) {
  return `${shownCount(priced_copies)} of ${shownCount(copies)} cards`;
}

export function shownCopyCount(copies: number) {
  return `${shownCount(copies)} ${copies === 1 ? 'copy' : 'copies'}`;
}

export function shownMatchCount(matchCount: number, { copies }: CollectionTotal) {
  return `${shownCount(matchCount)} of ${shownCopyCount(copies)}`;
}

export function priceCredit({ currency, rate_date }: { currency: string; rate_date?: string | null }) {
  if (rate_date) {
    return `TCGplayer Market price via Scryfall, converted from USD at the ECB rate for ${shownRateDay(rate_date)}`;
  }
  return currency === 'USD' ? 'Current prices from Scryfall, in USD' : undefined;
}

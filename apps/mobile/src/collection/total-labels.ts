import type { CollectionTotal } from '@mtgscan/supabase/collection';

import { shownPrice } from '@/collection/copy-labels';
import { shownPriceChange, spokenPriceChange } from '@/collection/price-change';

function shownCount(count: number) {
  return new Intl.NumberFormat('en-US').format(count);
}

export function shownTotal({ total, currency }: CollectionTotal) {
  return shownPrice({ amount: total, currency });
}

export function shownChange({ change, currency }: CollectionTotal) {
  return change === null ? undefined : shownPriceChange({ amount: change, currency });
}

export function spokenChange({ change, currency }: CollectionTotal) {
  return change === null ? 'change since yesterday not known yet' : `${spokenPriceChange({ amount: change, currency })} since yesterday`;
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

export function priceCredit({ currency }: Pick<CollectionTotal, 'currency'>) {
  return `Current prices from Scryfall, in ${currency}`;
}

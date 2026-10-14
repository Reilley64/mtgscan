import type { CollectionTotal } from '@mtgscan/supabase/collection';

import { shownPrice } from '@/collection/copy-labels';

function shownCount(count: number) {
  return new Intl.NumberFormat('en-US').format(count);
}

export function shownTotal({ total, currency }: CollectionTotal) {
  return shownPrice({ amount: total, currency });
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

import type { CollectionTotal } from '@mtgscan/supabase/collection';

import { shownPrice } from '@/collection/copy-labels';

const minusSign = '\u2212';

function shownCount(count: number) {
  return new Intl.NumberFormat('en-US').format(count);
}

export function shownTotal({ total, currency }: CollectionTotal) {
  return shownPrice({ amount: total, currency });
}

export function shownChange({ change, currency }: CollectionTotal) {
  if (change === null) {
    return undefined;
  }
  const amount = Number(change);
  const size = shownPrice({ amount: String(Math.abs(amount)), currency });
  return amount === 0 ? size : `${amount < 0 ? minusSign : '+'}${size}`;
}

export function spokenChange({ change, currency }: CollectionTotal) {
  if (change === null) {
    return 'change since yesterday not known yet';
  }
  const amount = Number(change);
  const size = shownPrice({ amount: String(Math.abs(amount)), currency });
  return amount === 0 ? 'no change since yesterday' : `${amount < 0 ? 'down' : 'up'} ${size} since yesterday`;
}

export function shownCoverage({ priced_copies, copies }: CollectionTotal) {
  return `${shownCount(priced_copies)} of ${shownCount(copies)} cards`;
}

export function priceSource({ currency }: CollectionTotal) {
  return `Current prices from Scryfall, in ${currency}`;
}

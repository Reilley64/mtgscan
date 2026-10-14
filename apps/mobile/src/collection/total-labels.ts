import type { CollectionTotal } from '@mtgscan/supabase/collection';

import { shownPrice } from '@/collection/copy-labels';

const minusSign = '\u2212';

function shownCount(count: number) {
  return new Intl.NumberFormat('en-US').format(count);
}

function changeSize(change: string, currency: CollectionTotal['currency']) {
  const amount = Number(change);
  return { direction: Math.sign(amount), size: shownPrice({ amount: String(Math.abs(amount)), currency }) };
}

export function shownTotal({ total, currency }: CollectionTotal) {
  return shownPrice({ amount: total, currency });
}

export function shownChange({ change, currency }: CollectionTotal) {
  if (change === null) {
    return undefined;
  }
  const { direction, size } = changeSize(change, currency);
  return `${direction < 0 ? minusSign : direction > 0 ? '+' : ''}${size}`;
}

export function spokenChange({ change, currency }: CollectionTotal) {
  if (change === null) {
    return 'change since yesterday not known yet';
  }
  const { direction, size } = changeSize(change, currency);
  return direction === 0 ? 'no change since yesterday' : `${direction < 0 ? 'down' : 'up'} ${size} since yesterday`;
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

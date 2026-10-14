import type { CurrentPrice } from '@mtgscan/supabase/collection';

import { shownPrice } from '@/collection/copy-labels';

type PriceChange = Pick<CurrentPrice, 'amount' | 'currency'>;

const minusSign = '\u2212';

function changeSize({ amount, currency }: PriceChange) {
  const change = Number(amount);
  return { direction: Math.sign(change), size: shownPrice({ amount: String(Math.abs(change)), currency }) };
}

export function shownPriceChange(change: PriceChange) {
  const { direction, size } = changeSize(change);
  return `${direction < 0 ? minusSign : direction > 0 ? '+' : ''}${size}`;
}

export function spokenPriceChange(change: PriceChange) {
  const { direction, size } = changeSize(change);
  return direction === 0 ? 'no change' : `${direction < 0 ? 'down' : 'up'} ${size}`;
}

export function changeSinceAdded(
  price: PriceChange | null,
  purchaseDayPrice: PriceChange | null,
): PriceChange | undefined {
  if (price === null || purchaseDayPrice === null) {
    return undefined;
  }
  return { amount: String(Number(price.amount) - Number(purchaseDayPrice.amount)), currency: price.currency };
}

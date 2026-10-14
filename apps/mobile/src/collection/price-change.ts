import type { CurrentPrice } from '@mtgscan/supabase/collection';

import { shownPrice } from '@/collection/copy-labels';

type PriceAmount = Pick<CurrentPrice, 'amount' | 'currency'>;

const minusSign = '\u2212';

function changeSize({ amount, currency }: PriceAmount) {
  const change = Number(amount);
  return { direction: Math.sign(change), size: shownPrice({ amount: String(Math.abs(change)), currency }) };
}

export function shownPriceChange(change: PriceAmount) {
  const { direction, size } = changeSize(change);
  return `${direction < 0 ? minusSign : direction > 0 ? '+' : ''}${size}`;
}

export function spokenPriceChange(change: PriceAmount) {
  const { direction, size } = changeSize(change);
  return direction === 0 ? 'no change' : `${direction < 0 ? 'down' : 'up'} ${size}`;
}

export function changeSinceAdded(
  price: PriceAmount | null,
  purchaseDayPrice: PriceAmount | null,
): PriceAmount | undefined {
  if (price === null || purchaseDayPrice === null) {
    return undefined;
  }
  return { amount: String(Number(price.amount) - Number(purchaseDayPrice.amount)), currency: price.currency };
}

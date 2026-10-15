import { minorUnitDigitsOf, shownPrice, spokenPrice, type PriceAmount } from '@/collection/price-currency-labels';

const minusSign = '\u2212';

function changeSize(change: PriceAmount) {
  return { direction: Math.sign(Number(change.amount)), size: { ...change, amount: change.amount.replace(/^-/, '') } };
}

export function shownPriceChange(change: PriceAmount) {
  const { direction, size } = changeSize(change);
  return `${direction < 0 ? minusSign : direction > 0 ? '+' : ''}${shownPrice(size)}`;
}

export function spokenPriceChange(change: PriceAmount) {
  const { direction, size } = changeSize(change);
  return direction === 0 ? 'no change' : `${direction < 0 ? 'down' : 'up'} ${spokenPrice(size)}`;
}

export function changeSinceAdded(price: PriceAmount | null, purchaseDayPrice: PriceAmount | null): PriceAmount | undefined {
  if (price === null || purchaseDayPrice === null) {
    return undefined;
  }
  const change = Number(price.amount) - Number(purchaseDayPrice.amount);
  return { amount: change.toFixed(minorUnitDigitsOf(price.amount)), currency: price.currency, approximate: price.approximate };
}

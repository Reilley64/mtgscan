import { approximately, minorUnitDigitsOf, shownAmount, type PriceAmount } from '@/collection/copy-labels';

const minusSign = '\u2212';

function changeSize({ amount, currency }: PriceAmount) {
  return { direction: Math.sign(Number(amount)), size: shownAmount({ amount: amount.replace(/^-/, ''), currency }) };
}

export function shownPriceChange(change: PriceAmount) {
  const { direction, size } = changeSize(change);
  return approximately(`${direction < 0 ? minusSign : direction > 0 ? '+' : ''}${size}`, change);
}

export function spokenPriceChange(change: PriceAmount) {
  const { direction, size } = changeSize(change);
  return direction === 0 ? 'no change' : `${direction < 0 ? 'down' : 'up'} ${approximately(size, change)}`;
}

export function changeSinceAdded(price: PriceAmount | null, purchaseDayPrice: PriceAmount | null): PriceAmount | undefined {
  if (price === null || purchaseDayPrice === null) {
    return undefined;
  }
  const change = Number(price.amount) - Number(purchaseDayPrice.amount);
  return { amount: change.toFixed(minorUnitDigitsOf(price.amount)), currency: price.currency, approximate: price.approximate };
}

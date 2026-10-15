import { describe, expect, test } from 'bun:test';

import { convertedPrice, usdExchangeRate, usdPriceBounds, type ExchangeRate, type PriceBounds } from '../converted-prices';

const today = new Date('2026-10-15T09:30:00Z');

function rate(currency: string, exchangeRate: string, minorUnitDigits = 2, rateDate = '2026-10-15'): ExchangeRate {
  return { currency, rate: exchangeRate, rate_date: rateDate, minor_unit_digits: minorUnitDigits };
}

const aud = rate('AUD', '1.5234');
const eur = rate('EUR', '0.93');
const jpy = rate('JPY', '151.37', 0);

function convertedAmount(usdAmount: string, exchangeRate: ExchangeRate) {
  return convertedPrice({ amount: usdAmount, currency: 'USD' }, exchangeRate, today).amount;
}

function isStale(exchangeRate: ExchangeRate, now = today) {
  const freshUsdPrice: { amount: string; currency: string; stale: boolean } = { amount: '1.00', currency: 'USD', stale: false };
  return convertedPrice(freshUsdPrice, exchangeRate, now).stale;
}

function cents(amount: string) {
  return Math.round(Number(amount) * 100);
}

function amountsWithin(bounds: PriceBounds, amounts: string[]) {
  return amounts.filter(
    (amount) =>
      (bounds.price_min === undefined || cents(amount) >= cents(bounds.price_min)) &&
      (bounds.price_max === undefined || cents(amount) <= cents(bounds.price_max)),
  );
}

describe('converted amounts', () => {
  test.each<[string, ExchangeRate, string[]]>([
    ['AUD', aud, ['0.32', '0.46', '0.67', '1.77']],
    ['EUR', eur, ['0.20', '0.28', '0.41', '1.08']],
    ['JPY', jpy, ['32', '45', '67', '176']],
    ['HUF', rate('HUF', '324.52'), ['68.15', '97.36', '142.79', '376.44']],
    ['IDR', rate('IDR', '17921'), ['3763.41', '5376.30', '7885.24', '20788.36']],
  ])('a USD amount in %s is the amount times the exchange rate, rounded to the minor unit', (_, exchangeRate, amounts) => {
    expect(['0.21', '0.30', '0.44', '1.16'].map((usd) => convertedAmount(usd, exchangeRate))).toEqual(amounts);
  });

  test('a converted amount that falls on half a minor unit rounds up', () => {
    expect(convertedAmount('1.00', rate('EUR', '1.005'))).toBe('1.01');
    expect(convertedAmount('0.10', rate('JPY', '15', 0))).toBe('2');
  });

  test('a collection total converts once, so it can differ from the sum of the converted copy prices', () => {
    expect(convertedAmount('0.21', eur)).toBe('0.20');
    expect(convertedAmount('1.05', eur)).toBe('0.98');
  });

  test('a USD amount in USD is unchanged', () => {
    expect(convertedAmount('1635.37', usdExchangeRate)).toBe('1635.37');
  });
});

describe('converted prices', () => {
  const usdPrice = { amount: '0.21', currency: 'USD', finish: 'nonfoil' as const, stale: false };

  test('a USD price keeps its amount and has no approximate flag, exchange rate, or rate date', () => {
    expect(convertedPrice(usdPrice, usdExchangeRate, today)).toEqual(usdPrice);
  });

  test('a converted price has the converted amount, the approximate flag, the exchange rate, and its date', () => {
    expect(convertedPrice(usdPrice, aud, today)).toEqual({
      amount: '0.32',
      currency: 'AUD',
      finish: 'nonfoil',
      stale: false,
      approximate: true,
      exchange_rate: '1.5234',
      rate_date: '2026-10-15',
    });
  });

  test('a purchase-day price has no stale flag in any currency', () => {
    const purchaseDayPrice = { amount: '0.21', currency: 'USD', finish: 'nonfoil' as const };

    expect(convertedPrice(purchaseDayPrice, rate('AUD', '1.5234', 2, '2026-10-01'), today)).not.toHaveProperty('stale');
  });

  test('a converted price is stale when its USD price is stale', () => {
    expect(convertedPrice({ ...usdPrice, stale: true }, aud, today).stale).toBe(true);
  });

  test.each<[string, string, boolean]>([
    ["a rate 3 days old, as Friday's rate is on a Monday", '2026-10-12', false],
    ['a rate 4 days old', '2026-10-11', false],
    ['a rate 5 days old', '2026-10-10', true],
  ])('with %s, a converted price is stale: %p', (_, rateDate, stale) => {
    const exchangeRate = rate('AUD', '1.5234', 2, rateDate);

    expect(convertedPrice(usdPrice, exchangeRate, today).stale).toBe(stale);
  });

  test('a rate is stale from the start of the fifth day after its date in UTC', () => {
    const exchangeRate = rate('AUD', '1.5234', 2, '2026-10-11');

    expect(isStale(exchangeRate, new Date('2026-10-15T23:59:59Z'))).toBe(false);
    expect(isStale(exchangeRate, new Date('2026-10-16T00:00:00Z'))).toBe(true);
  });

  test('a USD price is never stale for an exchange rate', () => {
    expect(isStale(usdExchangeRate, new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('price bounds in USD', () => {
  const usdAmounts = ['0.21', '0.30', '0.44'];

  test.each<[string, ExchangeRate, PriceBounds, string[]]>([
    ['an AUD price range', aud, { price_min: '0.40', price_max: '0.50' }, ['0.30']],
    ['a JPY maximum equal to a shown price', jpy, { price_max: '45' }, ['0.21', '0.30']],
    ['a EUR minimum equal to a shown price', eur, { price_min: '0.41' }, ['0.44']],
    ['a EUR range whose bounds equal the shown prices', eur, { price_min: '0.20', price_max: '0.28' }, ['0.21', '0.30']],
    ['a EUR maximum just below a shown price', eur, { price_max: '0.19' }, []],
  ])('%s matches every USD price that shows inside it', (_, exchangeRate, bounds, matched) => {
    expect(amountsWithin(usdPriceBounds(bounds, exchangeRate), usdAmounts)).toEqual(matched);
  });

  test('a USD bound is unchanged, in cents', () => {
    expect(usdPriceBounds({ price_min: '4.99', price_max: '5' }, usdExchangeRate)).toEqual({ price_min: '4.99', price_max: '5.00' });
  });

  test.each<[string, ExchangeRate]>([
    ['AUD', aud],
    ['JPY', jpy],
    ['IDR', rate('IDR', '17921')],
    ['a rate that lands on half a cent', rate('EUR', '0.5')],
  ])('in %s, a bound matches a USD price exactly when the converted price shows inside the bound', (_, exchangeRate) => {
    const usdPrices = Array.from({ length: 3000 }, (_, index) => (index / 100).toFixed(2));
    const shownPrices = usdPrices.map((usd) => Number(convertedAmount(usd, exchangeRate)));
    for (const bound of ['0', '1', '2.49', '13', '45', '450', '5000', '20000']) {
      const atMost = usdPriceBounds({ price_max: bound }, exchangeRate);
      const atLeast = usdPriceBounds({ price_min: bound }, exchangeRate);

      expect(amountsWithin(atMost, usdPrices)).toEqual(usdPrices.filter((_, index) => shownPrices[index]! <= Number(bound)));
      expect(amountsWithin(atLeast, usdPrices)).toEqual(usdPrices.filter((_, index) => shownPrices[index]! >= Number(bound)));
    }
  });

  test('a range that no converted price can show matches no USD price and keeps its minimum at most its maximum', () => {
    const bounds = usdPriceBounds({ price_min: '100', price_max: '100' }, rate('JPY', '150', 0));

    expect(cents(bounds.price_min!)).toBeLessThanOrEqual(cents(bounds.price_max!));
    expect(amountsWithin(bounds, ['0.66', '0.67', '21474836.47'])).toEqual([]);
  });

  test('a minimum above its maximum stays above it, so the search refuses it', () => {
    const { price_min, price_max } = usdPriceBounds({ price_min: '5.01', price_max: '4.99' }, aud);

    expect(cents(price_min!)).toBeGreaterThan(cents(price_max!));
  });

  test('a bound converts to at most 9999999999.99 USD', () => {
    expect(usdPriceBounds({ price_max: '9999999999.99' }, rate('GBP', '0.79'))).toEqual({ price_max: '9999999999.99' });
    expect(usdPriceBounds({ price_min: '1500000.01' }, aud)).toEqual({ price_min: '984639.63' });
  });
});

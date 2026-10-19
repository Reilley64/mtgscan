import { z } from 'zod';

import { databaseFunction } from './database-function.ts';
import { integer } from './fields.ts';

const exchangeRate = z.strictObject({ currency: z.string(), rate: z.string(), rate_date: z.string().nullable(), minor_unit_digits: integer });

export type ExchangeRate = z.infer<typeof exchangeRate>;

const exchangeRateList = z.strictObject({ items: z.array(exchangeRate) });

export const listExchangeRates = databaseFunction({
  name: 'list_exchange_rates',
  argument: null,
  request: z.undefined(),
  reply: exchangeRateList,
  errorCodes: [],
});

export const usdExchangeRate: ExchangeRate = { currency: 'USD', rate: '1', rate_date: null, minor_unit_digits: 2 };

export type ConversionFields = {
  approximate?: true;
  exchange_rate?: string;
  rate_date?: string;
};

type UsdPrice = {
  amount: string;
  currency: string;
  stale?: boolean;
};

export type PriceBounds = {
  price_min?: string;
  price_max?: string;
};

const staleAfterDays = 4;

const dayInMs = 24 * 60 * 60 * 1000;

const largestBoundCents = 999999999999n;

const aboveEveryPrice = { price_min: '9999999999.99', price_max: '9999999999.99' };

type Decimal = { units: bigint; scale: number };

function decimalOf(text: string): Decimal {
  const [whole, fraction = ''] = text.split('.');
  return { units: BigInt(whole + fraction), scale: fraction.length };
}

function unitsAtScale({ units, scale }: Decimal, targetScale: number) {
  return units * 10n ** BigInt(targetScale - scale);
}

function decimalText(units: bigint, digits: number) {
  const text = units.toString().padStart(digits + 1, '0');
  return digits === 0 ? text : `${text.slice(0, -digits)}.${text.slice(-digits)}`;
}

function ceilingOf(numerator: bigint, denominator: bigint) {
  return numerator <= 0n ? -(-numerator / denominator) : (numerator + denominator - 1n) / denominator;
}

function clampedCents(cents: bigint) {
  return cents < 0n ? 0n : cents > largestBoundCents ? largestBoundCents : cents;
}

function exchangeRateIsStale({ rate_date }: ExchangeRate, now = new Date()) {
  const oldestFreshDay = new Date(now.getTime() - staleAfterDays * dayInMs).toISOString().slice(0, 10);
  return rate_date !== null && rate_date < oldestFreshDay;
}

function convertedAmount(usdAmount: string, rate: ExchangeRate) {
  const amount = decimalOf(usdAmount);
  const factor = decimalOf(rate.rate);
  const numerator = amount.units * factor.units * 10n ** BigInt(rate.minor_unit_digits);
  const denominator = 10n ** BigInt(amount.scale + factor.scale);
  return decimalText((2n * numerator + denominator) / (2n * denominator), rate.minor_unit_digits);
}

export function convertedPrice<Price extends UsdPrice>(price: Price, rate: ExchangeRate, now = new Date()): Price & ConversionFields {
  if (rate.currency === 'USD') {
    return price;
  }
  return {
    ...price,
    amount: convertedAmount(price.amount, rate),
    currency: rate.currency,
    approximate: true,
    exchange_rate: rate.rate,
    rate_date: rate.rate_date ?? undefined,
    ...(price.stale === undefined ? {} : { stale: price.stale || exchangeRateIsStale(rate, now) }),
  };
}

export function usdPriceBounds({ price_min, price_max }: PriceBounds, rate: ExchangeRate): PriceBounds {
  const min = price_min === undefined ? undefined : decimalOf(price_min);
  const max = price_max === undefined ? undefined : decimalOf(price_max);
  const scale = Math.max(rate.minor_unit_digits + 1, min?.scale ?? 0, max?.scale ?? 0);
  const halfMinorUnit = 5n * 10n ** BigInt(scale - rate.minor_unit_digits - 1);
  const factor = decimalOf(rate.rate);
  const denominator = 10n ** BigInt(scale) * factor.units;
  const centsTimesDenominator = (units: bigint) => units * 100n * 10n ** BigInt(factor.scale);
  const minUnits = min && unitsAtScale(min, scale);
  const maxUnits = max && unitsAtScale(max, scale);
  const minCents = minUnits === undefined ? undefined : clampedCents(ceilingOf(centsTimesDenominator(minUnits - halfMinorUnit), denominator));
  const maxCents = maxUnits === undefined ? undefined : clampedCents(ceilingOf(centsTimesDenominator(maxUnits + halfMinorUnit), denominator) - 1n);
  if (minUnits !== undefined && maxUnits !== undefined && minUnits <= maxUnits && minCents! > maxCents!) {
    return aboveEveryPrice;
  }
  return {
    ...(minCents === undefined ? {} : { price_min: decimalText(minCents, 2) }),
    ...(maxCents === undefined ? {} : { price_max: decimalText(maxCents, 2) }),
  };
}

import { expect } from 'bun:test';

import type { CurrentPrice } from '../collection';
import { secretKeyClient } from './local-stack';

const testExchangeRates = { AUD: 1.5234, EUR: 0.93, JPY: 151.37 };

export function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function storeExchangeRates(rates: Record<string, number> = testExchangeRates, rateDate = daysAgo(0)) {
  const client = secretKeyClient();
  expect((await client.from('exchange_rates').delete().not('currency', 'is', null)).error).toBeNull();
  const rows = Object.entries({ ...rates, USD: 1 }).map(([currency, rate]) => ({ currency, rate, rate_date: rateDate }));
  expect((await client.from('exchange_rates').insert(rows)).error).toBeNull();
}

export function convertedPrice(
  currency: string,
  exchangeRate: string,
  amount: string,
  finish: CurrentPrice['finish'],
  rateDate = daysAgo(0),
): Omit<CurrentPrice, 'stale'> {
  return { amount, currency, finish, approximate: true, exchange_rate: exchangeRate, rate_date: rateDate };
}

import { expect } from 'bun:test';

import { secretKeyClient } from './local-stack';

export const testExchangeRates = { AUD: 1.5234, EUR: 0.93, JPY: 151.37 };

export function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export async function storeExchangeRates(rates: Record<string, number> = testExchangeRates, rateDate = daysAgo(0)) {
  const client = secretKeyClient();
  expect((await client.from('exchange_rates').delete().not('currency', 'is', null)).error).toBeNull();
  const rows = Object.entries({ ...rates, USD: 1 }).map(([currency, rate]) => ({ currency, rate, rate_date: rateDate }));
  expect((await client.from('exchange_rates').insert(rows)).error).toBeNull();
}

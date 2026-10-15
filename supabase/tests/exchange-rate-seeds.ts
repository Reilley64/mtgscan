import { expect } from 'bun:test';

import type { ExchangeRate, ExchangeRateList } from '../converted-prices';
import { secretKeyClient, type AppClient } from './local-stack';

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

export async function exchangeRates(client: AppClient): Promise<ExchangeRate[]> {
  const { data, error } = await client.rpc('list_exchange_rates');
  expect(error).toBeNull();
  return (data as unknown as ExchangeRateList).items;
}

export async function exchangeRateOf(client: AppClient, currency: string): Promise<ExchangeRate> {
  const rate = (await exchangeRates(client)).find((row) => row.currency === currency);
  if (!rate) {
    throw new Error(`${currency} has no stored exchange rate`);
  }
  return rate;
}

import type { Json } from '../database.types';
import { ImportFailed, type ImportAdapter, type StagedRow } from './import-run';
import { importUserAgent, openLocation } from './source-file';

const baseCurrency = 'USD';

export const frankfurterLatestRatesUrl = `https://api.frankfurter.dev/v1/latest?base=${baseCurrency}`;

type FrankfurterRates = {
  base?: string;
  date?: string;
  rates?: Record<string, Json>;
};

async function* rateRows(date: string, rates: Record<string, Json>): AsyncGenerator<StagedRow> {
  for (const [currency, rate] of [[baseCurrency, 1], ...Object.entries(rates)] as const) {
    yield { target: 'exchange_rates', row: { currency, rate, rate_date: date } };
  }
}

export async function frankfurterExchangeRates(location: string): Promise<ImportAdapter> {
  const response = await openLocation(location, { 'User-Agent': importUserAgent, Accept: 'application/json' });
  const { base, date, rates } = (await response.json()) as FrankfurterRates;
  if (base !== baseCurrency || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !rates) {
    throw new ImportFailed(`${location} holds no exchange rates from ${baseCurrency} with an ECB date.`);
  }
  return {
    source: 'exchange_rates',
    sourceUpdatedAt: new Date(`${date}T00:00:00Z`),
    rows: () => rateRows(date, rates),
  };
}

import { beforeAll, beforeEach, describe, expect, setDefaultTimeout, test } from 'bun:test';

import {
  type FrankfurterRates,
  exchangeRatesFixture,
  exchangeRatesFixtureLatest,
  expectSuccess,
  latestRun,
  resetCardCatalog,
  runExchangeRateImport,
} from './catalog-import-command';
import { secretKeyClient, signUpNewUser, type TestUser } from './local-stack';

setDefaultTimeout(60_000);

let alice: TestUser;

beforeAll(async () => {
  alice = await signUpNewUser();
});

async function exchangeRates() {
  const { data, error } = await alice.client
    .from('exchange_rates')
    .select('currency, rate, rate_date')
    .order('currency');
  expect(error).toBeNull();
  return data!;
}

async function exchangeRate(currency: string) {
  return (await exchangeRates()).find((row) => row.currency === currency);
}

function onTheNextDay(rates: FrankfurterRates): FrankfurterRates {
  return { ...rates, date: '2026-10-15', rates: { ...rates.rates, AUD: 1.4301, JPY: 159.02 } };
}

function withRates(changed: FrankfurterRates['rates']) {
  return (rates: FrankfurterRates): FrankfurterRates => {
    const nextDay = onTheNextDay(rates);
    return { ...nextDay, rates: { ...nextDay.rates, ...changed } };
  };
}

beforeEach(async () => {
  await resetCardCatalog();
  const { error } = await secretKeyClient().from('exchange_rates').delete().not('currency', 'is', null);
  expect(error).toBeNull();
  await expectSuccess(runExchangeRateImport(exchangeRatesFixtureLatest));
});

describe('after one exchange rate import', () => {
  test('each currency in the latest rates keeps its exchange rate from USD with the ECB date of the rate', async () => {
    const rates = await exchangeRates();

    expect(rates.map((row) => row.currency).join(' ')).toBe(
      'AUD BRL CAD CHF CNY CZK DKK EUR GBP HKD HUF IDR ILS INR ISK JPY KRW MXN MYR NOK NZD PHP PLN RON SEK SGD THB TRY USD ZAR',
    );
    expect(rates.every((row) => row.rate_date === '2026-10-14')).toBe(true);
    expect(await exchangeRate('AUD')).toEqual({ currency: 'AUD', rate: 1.4266, rate_date: '2026-10-14' });
    expect(await exchangeRate('CHF')).toEqual({ currency: 'CHF', rate: 0.83341, rate_date: '2026-10-14' });
    expect(await exchangeRate('IDR')).toEqual({ currency: 'IDR', rate: 17921, rate_date: '2026-10-14' });
    expect(await exchangeRate('USD')).toEqual({ currency: 'USD', rate: 1, rate_date: '2026-10-14' });
  });
});

describe('exchange rate import runs', () => {
  test('a later run replaces every exchange rate and its date', async () => {
    await expectSuccess(runExchangeRateImport(await exchangeRatesFixture(onTheNextDay)));

    const rates = await exchangeRates();
    expect(rates).toHaveLength(30);
    expect(rates.every((row) => row.rate_date === '2026-10-15')).toBe(true);
    expect(await exchangeRate('AUD')).toEqual({ currency: 'AUD', rate: 1.4301, rate_date: '2026-10-15' });
    expect(await exchangeRate('JPY')).toEqual({ currency: 'JPY', rate: 159.02, rate_date: '2026-10-15' });
    expect((await latestRun('exchange_rates')).counts).toMatchObject({
      exchange_rates: { inserted: 0, updated: 30, deleted: 0 },
    });
  });

  test('a currency that left the latest rates is removed, and a new one is added', async () => {
    await expectSuccess(
      runExchangeRateImport(
        await exchangeRatesFixture((rates) => {
          const nextDay = onTheNextDay(rates);
          const { TRY: _, ...otherRates } = nextDay.rates;
          return { ...nextDay, rates: { ...otherRates, RUB: 92.5 } };
        }),
      ),
    );

    const currencies = (await exchangeRates()).map((row) => row.currency);
    expect(currencies).toHaveLength(30);
    expect(currencies).not.toContain('TRY');
    expect(await exchangeRate('RUB')).toEqual({ currency: 'RUB', rate: 92.5, rate_date: '2026-10-15' });
    expect((await latestRun('exchange_rates')).counts).toMatchObject({
      exchange_rates: { inserted: 1, deleted: 1 },
    });
  });

  test('the owner can accept a file with fewer currencies, and the rates that left the file are removed', async () => {
    await expectSuccess(
      runExchangeRateImport(
        await exchangeRatesFixture((rates) => ({ ...onTheNextDay(rates), rates: { EUR: 0.9 } })),
        '--accept-shrink',
      ),
    );

    expect(await exchangeRates()).toEqual([
      { currency: 'EUR', rate: 0.9, rate_date: '2026-10-15' },
      { currency: 'USD', rate: 1, rate_date: '2026-10-15' },
    ]);
  });

  test('a run with the same ECB date records a skipped run and keeps the rates', async () => {
    const output = await expectSuccess(
      runExchangeRateImport(await exchangeRatesFixture((rates) => ({ ...rates, rates: { ...rates.rates, AUD: 2 } }))),
    );

    expect(output).toContain('Skipped');
    expect((await latestRun('exchange_rates')).status).toBe('skipped');
    expect((await exchangeRate('AUD'))!.rate).toBe(1.4266);
  });

  test.each([
    ['a rate of zero', withRates({ AUD: 0 }), 'exchange_rates_rate_check'],
    ['a missing rate', withRates({ AUD: null }), 'exchange_rates: required fields are missing in 1 staged rows'],
    [
      'a file with fewer currencies',
      (rates: FrankfurterRates) => ({ ...onTheNextDay(rates), rates: { EUR: 0.9 } }),
      'exchange_rates: would shrink by more than 5%',
    ],
  ] satisfies [string, (rates: FrankfurterRates) => FrankfurterRates, string][])(
    '%s fails the run and keeps the old rates',
    async (_, change, reason) => {
      const result = await runExchangeRateImport(await exchangeRatesFixture(change));

      expect(result.exitCode).toBe(1);
      const run = await latestRun('exchange_rates');
      expect(run.status).toBe('failed');
      expect(run.failure_reason).toContain(reason);
      expect(await exchangeRates()).toHaveLength(30);
      expect(await exchangeRate('AUD')).toEqual({ currency: 'AUD', rate: 1.4266, rate_date: '2026-10-14' });
    },
  );

  test.each([
    ['a file that is not JSON', () => 'not JSON'],
    ['a file with no ECB date', (rates: FrankfurterRates) => ({ ...rates, date: '' })],
    ['a file with rates from another currency', (rates: FrankfurterRates) => ({ ...onTheNextDay(rates), base: 'EUR' })],
  ] satisfies [string, (rates: FrankfurterRates) => FrankfurterRates | string][])(
    '%s fails the import and keeps the old rates',
    async (_, change) => {
      const before = await latestRun('exchange_rates');

      const result = await runExchangeRateImport(await exchangeRatesFixture(change));

      expect(result.exitCode).toBe(1);
      expect(await latestRun('exchange_rates')).toEqual(before);
      expect(await exchangeRate('AUD')).toEqual({ currency: 'AUD', rate: 1.4266, rate_date: '2026-10-14' });
    },
  );
});

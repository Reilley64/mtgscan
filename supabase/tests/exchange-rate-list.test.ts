import { describe, expect, setDefaultTimeout, test } from 'bun:test';

import { listExchangeRates } from '../converted-prices';
import { call, failed } from './database-calls';
import { daysAgo, exchangeRates, storeExchangeRates } from './exchange-rate-seeds';
import { anonymousClient, secretKeyClient, signUpNewUser } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';

describe('the exchange rate list', () => {
  test('a signed-in user reads USD and every stored exchange rate, in code order, with its date and minor unit digits', async () => {
    const user = await signUpNewUser();
    await storeExchangeRates({ JPY: 151.37, AUD: 1.5234, EUR: 0.93 }, daysAgo(2));

    expect(await exchangeRates(user.client)).toEqual([
      { currency: 'AUD', rate: '1.5234', rate_date: daysAgo(2), minor_unit_digits: 2 },
      { currency: 'EUR', rate: '0.93', rate_date: daysAgo(2), minor_unit_digits: 2 },
      { currency: 'JPY', rate: '151.37', rate_date: daysAgo(2), minor_unit_digits: 0 },
      { currency: 'USD', rate: '1', rate_date: null, minor_unit_digits: 2 },
    ]);
  });

  test('a currency that the latest exchange rates drop is no longer listed, and one they add is', async () => {
    const user = await signUpNewUser();
    await storeExchangeRates({ AUD: 1.5234, HUF: 324.52, IDR: 17921 });

    const rates = await exchangeRates(user.client);

    expect(rates.map((row) => row.currency)).toEqual(['AUD', 'HUF', 'IDR', 'USD']);
    expect(rates.filter((row) => row.currency !== 'AUD' && row.currency !== 'USD').map((row) => row.minor_unit_digits)).toEqual([2, 2]);
  });

  test('USD is listed when no exchange rate is stored', async () => {
    const user = await signUpNewUser();
    const { error } = await secretKeyClient().from('exchange_rates').delete().not('currency', 'is', null);
    expect(error).toBeNull();

    const rates = await exchangeRates(user.client);
    await storeExchangeRates();

    expect(rates).toEqual([{ currency: 'USD', rate: '1', rate_date: null, minor_unit_digits: 2 }]);
  });

  test.each([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot read the exchange rate list', async (_, client) => {
    expect(await call(client(), listExchangeRates)).toMatchObject(failed(permissionDenied));
  });

});

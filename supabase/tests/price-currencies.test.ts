import { beforeAll, describe, expect, setDefaultTimeout, test } from 'bun:test';

import type { PriceCurrencyList } from '../search';
import { storeExchangeRates } from './exchange-rate-seeds';
import { anonymousClient, secretKeyClient, signUpNewUser, type AppClient } from './local-stack';

setDefaultTimeout(60_000);

const permissionDenied = '42501';

beforeAll(async () => {
  await storeExchangeRates({ JPY: 151.37, AUD: 1.5234, EUR: 0.93 });
});

async function priceCurrencies(client: AppClient) {
  const { data, error } = await client.rpc('list_price_currencies');
  expect(error).toBeNull();
  return (data as unknown as PriceCurrencyList).items;
}

describe('the price currency list', () => {
  test('a signed-in user reads USD and every currency with an exchange rate, in code order, with its minor unit digits', async () => {
    const user = await signUpNewUser();

    expect(await priceCurrencies(user.client)).toEqual([
      { currency: 'AUD', minor_unit_digits: 2 },
      { currency: 'EUR', minor_unit_digits: 2 },
      { currency: 'JPY', minor_unit_digits: 0 },
      { currency: 'USD', minor_unit_digits: 2 },
    ]);
  });

  test('a currency that the latest exchange rates drop is no longer listed, and one they add is', async () => {
    const user = await signUpNewUser();
    await storeExchangeRates({ AUD: 1.5234, HUF: 324.52 });

    expect((await priceCurrencies(user.client)).map((row) => row.currency)).toEqual(['AUD', 'HUF', 'USD']);
    expect(await priceCurrencies(user.client)).toContainEqual({ currency: 'HUF', minor_unit_digits: 2 });
  });

  test.each([
    ['an anonymous caller', anonymousClient],
    ['the secret key', secretKeyClient],
  ])('%s cannot read the price currency list', async (_, client) => {
    const { data, error } = await client().rpc('list_price_currencies');

    expect(data).toBeNull();
    expect(error?.code).toBe(permissionDenied);
  });
});

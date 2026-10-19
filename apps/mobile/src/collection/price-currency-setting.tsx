import { usdExchangeRate, type ExchangeRate } from '@mtgscan/supabase/converted-prices';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { createContext, use, useMemo, useState, type ReactNode } from 'react';

import { useSession } from '@/auth/session';
import { databaseRead, useAppRead, type Read } from '@/lib/read';

const currencyKey = 'currency';

const ratesReadAgainAfterMs = 24 * 60 * 60 * 1000;

const exchangeRatesRead = databaseRead(databaseFunctions.list_exchange_rates);

type PriceCurrencies = Read<{ items: ExchangeRate[] }>;

type PriceCurrencySetting = {
  priceCurrency: ExchangeRate | null;
  priceCurrencies: PriceCurrencies;
  reloadPriceCurrencies: () => void;
  setCurrency: (currency: string) => void;
};

const PriceCurrencyContext = createContext<PriceCurrencySetting | null>(null);

function regionCurrency() {
  return getLocales()[0]?.currencyCode ?? usdExchangeRate.currency;
}

function loadedRates({ items }: { items: ExchangeRate[] }) {
  return { items };
}

function shownCurrency(chosen: string, priceCurrencies: PriceCurrencies) {
  switch (priceCurrencies.status) {
    case 'loading':
      return null;
    case 'failed':
      return usdExchangeRate;
    case 'loaded':
      return priceCurrencies.items.find((row) => row.currency === chosen) ?? usdExchangeRate;
  }
}

export function PriceCurrencyProvider({ children }: { children: ReactNode }) {
  const signedIn = useSession() !== null;
  const [chosen, setChosen] = useState(() => SecureStore.getItem(currencyKey) ?? regionCurrency());
  const { read: priceCurrencies, reload } = useAppRead(signedIn ? exchangeRatesRead : null, loadedRates, {
    whenAppActive: true,
    staleTime: ratesReadAgainAfterMs,
  });

  const setting = useMemo<PriceCurrencySetting>(
    () => ({
      priceCurrency: shownCurrency(chosen, priceCurrencies),
      priceCurrencies,
      reloadPriceCurrencies: () => void reload(),
      setCurrency: (currency) => {
        setChosen(currency);
        void SecureStore.setItemAsync(currencyKey, currency);
      },
    }),
    [chosen, priceCurrencies, reload],
  );

  return <PriceCurrencyContext value={setting}>{children}</PriceCurrencyContext>;
}

export function usePriceCurrency(): PriceCurrencySetting {
  const setting = use(PriceCurrencyContext);
  if (!setting) {
    throw new Error('usePriceCurrency needs a PriceCurrencyProvider');
  }
  return setting;
}

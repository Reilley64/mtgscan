import { usdExchangeRate, type ExchangeRate, type ExchangeRateList } from '@mtgscan/supabase/converted-prices';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/auth/session';
import { supabase } from '@/lib/supabase';

const currencyKey = 'currency';

const ratesReadAgainAfterMs = 24 * 60 * 60 * 1000;

type PriceCurrencies =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; items: ExchangeRate[]; readAt: number };

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
  const [priceCurrencies, setPriceCurrencies] = useState<PriceCurrencies>({ status: 'loading' });
  const [readCount, setReadCount] = useState(0);

  useEffect(() => {
    if (!signedIn) {
      return;
    }
    let current = true;
    supabase.rpc('list_exchange_rates').then(({ data, error }) => {
      if (!current) {
        return;
      }
      setPriceCurrencies((shown) =>
        error
          ? shown.status === 'loaded'
            ? shown
            : { status: 'failed' }
          : { status: 'loaded', items: (data as unknown as ExchangeRateList).items, readAt: Date.now() },
      );
    });
    return () => {
      current = false;
    };
  }, [signedIn, readCount]);

  const reloadPriceCurrencies = useCallback(() => {
    setPriceCurrencies({ status: 'loading' });
    setReadCount((count) => count + 1);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }
      if (priceCurrencies.status === 'failed') {
        reloadPriceCurrencies();
      } else if (priceCurrencies.status === 'loaded' && Date.now() - priceCurrencies.readAt > ratesReadAgainAfterMs) {
        setReadCount((count) => count + 1);
      }
    });
    return () => subscription.remove();
  }, [priceCurrencies, reloadPriceCurrencies]);

  const setting = useMemo<PriceCurrencySetting>(
    () => ({
      priceCurrency: shownCurrency(chosen, priceCurrencies),
      priceCurrencies,
      reloadPriceCurrencies,
      setCurrency: (currency) => {
        setChosen(currency);
        void SecureStore.setItemAsync(currencyKey, currency);
      },
    }),
    [chosen, priceCurrencies, reloadPriceCurrencies],
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

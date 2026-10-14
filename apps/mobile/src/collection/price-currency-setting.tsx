import type { PriceCurrencyList, PriceCurrencyRow } from '@mtgscan/supabase/search';
import { getLocales } from 'expo-localization';
import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useSession } from '@/auth/session';
import { supabase } from '@/lib/supabase';

const currencyKey = 'currency';

const usd: PriceCurrencyRow = { currency: 'USD', minor_unit_digits: 2 };

export type PriceCurrencies = { status: 'loading' } | { status: 'failed' } | { status: 'loaded'; items: PriceCurrencyRow[] };

type PriceCurrencySetting = {
  currency: PriceCurrencyRow | null;
  priceCurrencies: PriceCurrencies;
  reloadPriceCurrencies: () => void;
  setCurrency: (currency: string) => void;
};

const PriceCurrencyContext = createContext<PriceCurrencySetting | null>(null);

function regionCurrency() {
  return getLocales()[0]?.currencyCode ?? usd.currency;
}

function shownCurrency(chosen: string, priceCurrencies: PriceCurrencies) {
  switch (priceCurrencies.status) {
    case 'loading':
      return null;
    case 'failed':
      return usd;
    case 'loaded':
      return priceCurrencies.items.find((row) => row.currency === chosen) ?? usd;
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
    supabase.rpc('list_price_currencies').then(({ data, error }) => {
      if (current) {
        setPriceCurrencies(error ? { status: 'failed' } : { status: 'loaded', items: (data as unknown as PriceCurrencyList).items });
      }
    });
    return () => {
      current = false;
    };
  }, [signedIn, readCount]);

  const reloadPriceCurrencies = useCallback(() => {
    setPriceCurrencies({ status: 'loading' });
    setReadCount((count) => count + 1);
  }, []);

  const setting = useMemo<PriceCurrencySetting>(
    () => ({
      currency: shownCurrency(chosen, priceCurrencies),
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

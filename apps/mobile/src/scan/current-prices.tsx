import type { CurrentPrice, CurrentPriceKey, CurrentPrices, CurrentPricesQuery } from '@mtgscan/supabase/collection';
import { convertedPrice } from '@mtgscan/supabase/converted-prices';
import { createContext, use, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';

import { usePriceCurrency } from '@/collection/price-currency-setting';
import { priceLabels, type PriceLabels } from '@/collection/price-currency-labels';
import { supabase } from '@/lib/supabase';

import type { BatchScan } from './scan-batch';

const itemsPerRead = 100;

type KnownPrices = ReadonlyMap<string, CurrentPrice | null>;

export type ScanPrice = PriceLabels;

type CurrentPricesState = {
  known: KnownPrices;
  readPrices: (keys: CurrentPriceKey[]) => void;
};

const CurrentPricesContext = createContext<CurrentPricesState | null>(null);

function keyId({ printing_id, finish }: CurrentPriceKey) {
  return `${printing_id}|${finish}`;
}

function keyOf(scan: BatchScan): CurrentPriceKey {
  return { printing_id: scan.printing.printingId, finish: scan.finish };
}

function scanKeyId(scan: BatchScan) {
  return `${scan.scanId}|${keyId(keyOf(scan))}`;
}

function chunks<Item>(items: Item[], size: number) {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export function CurrentPricesProvider({ children }: { children: ReactNode }) {
  const [known, setKnown] = useState<KnownPrices>(new Map());
  const asked = useRef(new Set<string>());

  const readPrices = useCallback((keys: CurrentPriceKey[]) => {
    const unknown = new Map(keys.filter((key) => !asked.current.has(keyId(key))).map((key) => [keyId(key), key]));
    for (const items of chunks([...unknown.values()], itemsPerRead)) {
      items.forEach((key) => asked.current.add(keyId(key)));
      const query: CurrentPricesQuery = { items };
      void supabase.rpc('get_current_prices', { query }).then(({ data, error }) => {
        if (error) {
          items.forEach((key) => asked.current.delete(keyId(key)));
          return;
        }
        const rows = (data as unknown as CurrentPrices).items;
        setKnown((current) => new Map([...current, ...rows.map((row) => [keyId(row), row.price] as const)]));
      });
    }
  }, []);

  const state = useMemo(() => ({ known, readPrices }), [known, readPrices]);

  return <CurrentPricesContext value={state}>{children}</CurrentPricesContext>;
}

export function useScanPrices(scans: readonly BatchScan[]) {
  const state = use(CurrentPricesContext);
  if (!state) {
    throw new Error('useScanPrices needs a CurrentPricesProvider');
  }
  const { known, readPrices } = state;
  const { priceCurrency } = usePriceCurrency();
  const scanKeys = useRef(new Set<string>());
  const readNewScanKeys = useEffectEvent(() => {
    const newScans = scans.filter((scan) => !scanKeys.current.has(scanKeyId(scan)));
    newScans.forEach((scan) => scanKeys.current.add(scanKeyId(scan)));
    readPrices(newScans.map(keyOf));
  });

  useEffect(() => {
    readNewScanKeys();
  }, [readPrices, scans]);

  return (scan: BatchScan): ScanPrice | undefined => {
    const usdPrice = known.get(keyId(keyOf(scan)));
    if (usdPrice === undefined || !priceCurrency) {
      return undefined;
    }
    return priceLabels(usdPrice && convertedPrice(usdPrice, priceCurrency));
  };
}

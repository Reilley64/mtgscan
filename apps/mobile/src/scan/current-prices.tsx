import type { CurrentPrice, CurrentPriceKey, CurrentPrices, CurrentPricesQuery } from '@mtgscan/supabase/collection';
import type { PriceCurrency } from '@mtgscan/supabase/search';
import { createContext, use, useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, type ReactNode } from 'react';

import { shownPrice } from '@/collection/copy-labels';
import { usePriceCurrency } from '@/collection/price-currency-setting';
import { supabase } from '@/lib/supabase';

import type { BatchScan } from './scan-batch';

const itemsPerRead = 100;

type KnownPrices = Readonly<{ currency: PriceCurrency | undefined; prices: ReadonlyMap<string, CurrentPrice | null> }>;

export type ScanPrice = { shown: string | undefined; stale: boolean; spoken: string };

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
  const currency = usePriceCurrency().priceCurrency?.currency;
  const [known, setKnown] = useState<KnownPrices>({ currency, prices: new Map() });
  const asked = useRef<{ currency: PriceCurrency | undefined; ids: Set<string> }>({ currency, ids: new Set() });
  if (known.currency !== currency) {
    setKnown({ currency, prices: new Map() });
  }

  const readPrices = useCallback(
    (keys: CurrentPriceKey[]) => {
      if (!currency) {
        return;
      }
      if (asked.current.currency !== currency) {
        asked.current = { currency, ids: new Set() };
      }
      const askedNow = asked.current;
      const unknown = new Map(keys.filter((key) => !askedNow.ids.has(keyId(key))).map((key) => [keyId(key), key]));
      for (const items of chunks([...unknown.values()], itemsPerRead)) {
        items.forEach((key) => askedNow.ids.add(keyId(key)));
        const query: CurrentPricesQuery = { items, price_currency: currency };
        void supabase.rpc('get_current_prices', { query }).then(({ data, error }) => {
          if (error) {
            items.forEach((key) => askedNow.ids.delete(keyId(key)));
            return;
          }
          const rows = (data as unknown as CurrentPrices).items;
          setKnown((current) =>
            current.currency === currency
              ? { currency, prices: new Map([...current.prices, ...rows.map((row) => [keyId(row), row.price] as const)]) }
              : current,
          );
        });
      }
    },
    [currency],
  );

  const state = useMemo(() => ({ known, readPrices }), [known, readPrices]);

  return <CurrentPricesContext value={state}>{children}</CurrentPricesContext>;
}

export function useScanPrices(scans: readonly BatchScan[]) {
  const state = use(CurrentPricesContext);
  if (!state) {
    throw new Error('useScanPrices needs a CurrentPricesProvider');
  }
  const { known, readPrices } = state;
  const requested = useRef({ readPrices, scanKeys: new Set<string>() });
  const readNewScanKeys = useEffectEvent(() => {
    if (requested.current.readPrices !== readPrices) {
      requested.current = { readPrices, scanKeys: new Set() };
    }
    const { scanKeys } = requested.current;
    const newScans = scans.filter((scan) => !scanKeys.has(scanKeyId(scan)));
    newScans.forEach((scan) => scanKeys.add(scanKeyId(scan)));
    readPrices(newScans.map(keyOf));
  });

  useEffect(() => {
    readNewScanKeys();
  }, [readPrices, scans]);

  return (scan: BatchScan): ScanPrice | undefined => {
    const price = known.prices.get(keyId(keyOf(scan)));
    if (price === undefined) {
      return undefined;
    }
    const shown = price ? shownPrice(price) : undefined;
    return { shown, stale: price?.stale ?? false, spoken: shown ?? 'no price' };
  };
}

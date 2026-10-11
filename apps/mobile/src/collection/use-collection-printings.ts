import type { CollectionPrintingRow, CollectionPrintingsPage } from '@mtgscan/supabase/collection';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type Binder =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; printings: CollectionPrintingRow[]; nextCursor: string | null };

async function readCollectionPrintings(cursor: string | null) {
  const { data, error } = await supabase.rpc('list_collection_printings', { query: { cursor } });
  if (error) {
    throw error;
  }
  return data as unknown as CollectionPrintingsPage;
}

export function useCollectionPrintings() {
  const [binder, setBinder] = useState<Binder>({ status: 'loading' });
  const latestRead = useRef(0);
  const readingMore = useRef(false);

  const reload = useCallback(() => {
    const read = ++latestRead.current;
    readingMore.current = false;
    setBinder((current) => (current.status === 'failed' ? { status: 'loading' } : current));
    readCollectionPrintings(null).then(
      (page) => {
        if (read === latestRead.current) {
          setBinder({ status: 'loaded', printings: page.items, nextCursor: page.next_cursor });
        }
      },
      () => {
        if (read === latestRead.current) {
          setBinder((current) => (current.status === 'loaded' ? current : { status: 'failed' }));
        }
      },
    );
  }, []);

  useFocusEffect(reload);

  const loadMore = useCallback(() => {
    if (binder.status !== 'loaded' || binder.nextCursor === null || readingMore.current) {
      return;
    }
    const read = latestRead.current;
    readingMore.current = true;
    readCollectionPrintings(binder.nextCursor).then(
      (page) => {
        if (read !== latestRead.current) {
          return;
        }
        readingMore.current = false;
        setBinder((current) =>
          current.status === 'loaded'
            ? { ...current, printings: [...current.printings, ...page.items], nextCursor: page.next_cursor }
            : current,
        );
      },
      () => {
        if (read === latestRead.current) {
          readingMore.current = false;
        }
      },
    );
  }, [binder]);

  return { binder, reload, loadMore };
}

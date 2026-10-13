import type { CollectionCopiesPage, CollectionCopyRow } from '@mtgscan/supabase/collection';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type BinderRead =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'loaded'; copies: CollectionCopyRow[]; nextCursor: string | null };

async function readCollectionCopies(cursor: string | null) {
  const { data, error } = await supabase.rpc('list_collection_copies', { query: { cursor } });
  if (error) {
    throw error;
  }
  return data as unknown as CollectionCopiesPage;
}

export function useCollectionCopies() {
  const [binder, setBinder] = useState<BinderRead>({ status: 'loading' });
  const latestRead = useRef(0);
  const readingMore = useRef(false);

  const reload = useCallback(() => {
    const read = ++latestRead.current;
    readingMore.current = false;
    setBinder((current) => (current.status === 'failed' ? { status: 'loading' } : current));
    readCollectionCopies(null).then(
      (page) => {
        if (read === latestRead.current) {
          setBinder({ status: 'loaded', copies: page.items, nextCursor: page.next_cursor });
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
    readCollectionCopies(binder.nextCursor).then(
      (page) => {
        if (read !== latestRead.current) {
          return;
        }
        readingMore.current = false;
        setBinder((current) =>
          current.status === 'loaded'
            ? { ...current, copies: [...current.copies, ...page.items], nextCursor: page.next_cursor }
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

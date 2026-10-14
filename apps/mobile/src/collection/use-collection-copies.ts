import type { CollectionCopyRow, CollectionPage, CollectionQuery } from '@mtgscan/supabase/collection';
import { readSearchError } from '@mtgscan/supabase/search';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';

export type BinderRead =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'refused'; field: string }
  | {
      status: 'loaded';
      searchKey: string;
      copies: CollectionCopyRow[];
      nextCursor: string | null;
      matchCount: number | null;
    };

async function readCollectionCopies(search: CollectionQuery, cursor: string | null) {
  const query: CollectionQuery = { ...search, rows: 'copies', cursor };
  const { data, error } = await supabase.rpc('search_collection', { query });
  if (error) {
    throw error;
  }
  return data as unknown as CollectionPage<CollectionCopyRow>;
}

function refusedField(error: Parameters<typeof readSearchError>[0]) {
  const { code, field } = readSearchError(error);
  return code === 'invalid_argument' ? field : null;
}

export function useCollectionCopies(search: CollectionQuery) {
  const [binder, setBinder] = useState<BinderRead>({ status: 'loading' });
  const latestRead = useRef(0);
  const readingMore = useRef(false);
  const searchKey = JSON.stringify(search);

  const reload = useCallback(() => {
    const read = ++latestRead.current;
    readingMore.current = false;
    setBinder((current) =>
      current.status === 'loaded' && current.searchKey === searchKey ? current : { status: 'loading' },
    );
    readCollectionCopies(JSON.parse(searchKey), null).then(
      (page) => {
        if (read === latestRead.current) {
          setBinder({
            status: 'loaded',
            searchKey,
            copies: page.items,
            nextCursor: page.next_cursor,
            matchCount: page.total_count,
          });
        }
      },
      (error) => {
        if (read !== latestRead.current) {
          return;
        }
        const field = refusedField(error);
        setBinder((current) =>
          field ? { status: 'refused', field } : current.status === 'loaded' ? current : { status: 'failed' },
        );
      },
    );
  }, [searchKey]);

  useFocusEffect(reload);

  const loadMore = useCallback(() => {
    if (binder.status !== 'loaded' || binder.nextCursor === null || readingMore.current) {
      return;
    }
    const read = latestRead.current;
    readingMore.current = true;
    readCollectionCopies(JSON.parse(searchKey), binder.nextCursor).then(
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
      (error) => {
        if (read !== latestRead.current) {
          return;
        }
        readingMore.current = false;
        if (error.code === 'invalid_cursor') {
          reload();
        }
      },
    );
  }, [binder, reload, searchKey]);

  return { binder, reload, loadMore };
}

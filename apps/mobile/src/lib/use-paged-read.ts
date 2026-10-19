import { readSearchError } from '@mtgscan/supabase/search';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

type Page<Item> = { items: Item[]; next_cursor: string | null };

export type PagedRead<FirstPage extends Page<unknown>> =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'refused'; field: string }
  | {
      status: 'loaded';
      queryKey: string;
      firstPage: FirstPage;
      items: FirstPage['items'];
      nextCursor: string | null;
      loadingMore: boolean;
    };

type ReadPage<Query, FirstPage> = (query: Query, cursor: string | null) => Promise<FirstPage>;

async function readAtLeast<Query, FirstPage extends Page<unknown>>(
  readPage: ReadPage<Query, FirstPage>,
  query: Query,
  count: number,
) {
  const first = await readPage(query, null);
  let { items, next_cursor: nextCursor } = first;
  while (items.length < count && nextCursor !== null) {
    const page = await readPage(query, nextCursor);
    items = [...items, ...page.items];
    nextCursor = page.next_cursor;
  }
  return { first, items, nextCursor };
}

function refusedField(error: Parameters<typeof readSearchError>[0]) {
  const { code, field } = readSearchError(error);
  return code === 'invalid_argument' ? field : null;
}

export function usePagedRead<Query, FirstPage extends Page<unknown>>(
  query: Query | null,
  readPage: ReadPage<Query, FirstPage>,
) {
  const [read, setRead] = useState<PagedRead<FirstPage>>({ status: 'loading' });
  const latestRead = useRef(0);
  const readingMore = useRef(false);
  const shownRead = useRef(read);
  const queryKey = JSON.stringify(query);

  useEffect(() => {
    shownRead.current = read;
  }, [read]);

  const reload = useCallback(() => {
    const query: Query | null = JSON.parse(queryKey);
    if (!query) {
      return;
    }
    const thisRead = ++latestRead.current;
    readingMore.current = false;
    setRead((current) => (current.status === 'loaded' && current.queryKey === queryKey ? current : { status: 'loading' }));
    const shown = shownRead.current;
    const shownCount = shown.status === 'loaded' && shown.queryKey === queryKey ? shown.items.length : 0;
    readAtLeast(readPage, query, shownCount).then(
      ({ first, items, nextCursor }) => {
        if (thisRead === latestRead.current) {
          setRead({ status: 'loaded', queryKey, firstPage: first, items, nextCursor, loadingMore: false });
        }
      },
      (error) => {
        if (thisRead !== latestRead.current) {
          return;
        }
        const field = refusedField(error);
        setRead((current) =>
          field ? { status: 'refused', field } : current.status === 'loaded' ? current : { status: 'failed' },
        );
      },
    );
  }, [queryKey, readPage]);

  useFocusEffect(reload);

  const loadMore = useCallback(() => {
    if (read.status !== 'loaded' || read.queryKey !== queryKey || read.nextCursor === null || readingMore.current) {
      return;
    }
    const thisRead = latestRead.current;
    readingMore.current = true;
    setRead((current) => (current.status === 'loaded' ? { ...current, loadingMore: true } : current));
    readPage(JSON.parse(queryKey), read.nextCursor).then(
      (page) => {
        if (thisRead !== latestRead.current) {
          return;
        }
        readingMore.current = false;
        setRead((current) =>
          current.status === 'loaded'
            ? { ...current, items: [...current.items, ...page.items], nextCursor: page.next_cursor, loadingMore: false }
            : current,
        );
      },
      (error) => {
        if (thisRead !== latestRead.current) {
          return;
        }
        readingMore.current = false;
        setRead((current) => (current.status === 'loaded' ? { ...current, loadingMore: false } : current));
        if (error.code === 'invalid_cursor') {
          reload();
        }
      },
    );
  }, [read, readPage, reload, queryKey]);

  return { read, reload, loadMore };
}

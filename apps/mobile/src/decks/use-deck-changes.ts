import type { DeckChange, DeckChangePage, DeckChangesQuery } from '@mtgscan/supabase/decks';
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { FocusedRead } from '@/lib/use-focused-read';

type DeckChangesRead = FocusedRead<{ status: 'loaded'; changes: DeckChange[]; nextCursor: string | null }>;

async function readDeckChanges(deckId: string, cursor: string | null) {
  const query: DeckChangesQuery = { deck_id: deckId, cursor };
  const { data, error } = await supabase.rpc('list_deck_changes', { query });
  if (error) {
    throw error;
  }
  return data as unknown as DeckChangePage;
}

export function useDeckChanges(deckId: string, revision: number | null) {
  const [history, setHistory] = useState<DeckChangesRead>({ status: 'loading' });
  const latestRead = useRef(0);
  const readingMore = useRef(false);

  const readFirstPage = useCallback(() => {
    const read = ++latestRead.current;
    readingMore.current = false;
    readDeckChanges(deckId, null).then(
      (page) => read === latestRead.current && setHistory({ status: 'loaded', changes: page.items, nextCursor: page.next_cursor }),
      () => read === latestRead.current && setHistory((current) => (current.status === 'loaded' ? current : { status: 'failed' })),
    );
  }, [deckId]);

  useEffect(() => {
    if (revision !== null) {
      readFirstPage();
    }
  }, [readFirstPage, revision]);

  function tryAgain() {
    setHistory({ status: 'loading' });
    readFirstPage();
  }

  const loadMore = useCallback(() => {
    if (history.status !== 'loaded' || history.nextCursor === null || readingMore.current) {
      return;
    }
    const read = latestRead.current;
    readingMore.current = true;
    readDeckChanges(deckId, history.nextCursor).then(
      (page) => {
        if (read !== latestRead.current) {
          return;
        }
        readingMore.current = false;
        setHistory((current) =>
          current.status === 'loaded'
            ? { ...current, changes: [...current.changes, ...page.items], nextCursor: page.next_cursor }
            : current,
        );
      },
      (error) => {
        readingMore.current = false;
        if (read === latestRead.current && error.code === 'invalid_cursor') {
          readFirstPage();
        }
      },
    );
  }, [deckId, history, readFirstPage]);

  return { history, tryAgain, loadMore };
}

import type { NeedsYouCounts } from '@mtgscan/supabase/decks';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { useSession } from '@/auth/session';
import { supabase } from '@/lib/supabase';

type NeedsYouCountsState = {
  total: number;
  countOf: (deckId: string) => number;
  reload: () => void;
};

const noCounts: NeedsYouCounts = { total: 0, decks: [] };

const NeedsYouCountsContext = createContext<NeedsYouCountsState | null>(null);

export function NeedsYouCountsProvider({ children }: { children: ReactNode }) {
  const userId = useSession()?.user.id;
  const [countsUserId, setCountsUserId] = useState(userId);
  const [counts, setCounts] = useState(noCounts);
  const [readCount, setReadCount] = useState(0);

  if (countsUserId !== userId) {
    setCountsUserId(userId);
    setCounts(noCounts);
  }

  useEffect(() => {
    if (!userId) {
      return;
    }
    let current = true;
    supabase.rpc('get_needs_you_counts').then(({ data, error }) => {
      if (current && !error) {
        setCounts(data as unknown as NeedsYouCounts);
      }
    });
    return () => {
      current = false;
    };
  }, [userId, readCount]);

  const reload = useCallback(() => setReadCount((count) => count + 1), []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        reload();
      }
    });
    return () => subscription.remove();
  }, [reload]);

  const state = useMemo<NeedsYouCountsState>(
    () => ({
      total: counts.total,
      countOf: (deckId) => counts.decks.find((deck) => deck.deck_id === deckId)?.count ?? 0,
      reload,
    }),
    [counts, reload],
  );

  return <NeedsYouCountsContext value={state}>{children}</NeedsYouCountsContext>;
}

export function useNeedsYouCounts(): NeedsYouCountsState {
  const state = use(NeedsYouCountsContext);
  if (!state) {
    throw new Error('useNeedsYouCounts needs a NeedsYouCountsProvider');
  }
  return state;
}

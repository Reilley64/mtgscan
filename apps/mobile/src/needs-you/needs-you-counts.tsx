import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { NeedsYouCounts } from '@mtgscan/supabase/decks';
import { createContext, use, useMemo, type ReactNode } from 'react';

import { useSession } from '@/auth/session';
import { databaseRead, useAppRead } from '@/lib/read';

type NeedsYouCountsState = {
  total: number;
  countOf: (deckId: string) => number;
};

export const needsYouKey = ['needs_you'];

const noCounts: NeedsYouCounts = { total: 0, decks: [] };

const NeedsYouCountsContext = createContext<NeedsYouCountsState | null>(null);

export function needsYouCountsRead(userId: string | undefined) {
  const read = databaseRead(databaseFunctions.get_needs_you_counts);
  return userId ? { ...read, key: [...needsYouKey, ...read.key, userId] } : null;
}

export function loadedCounts(counts: NeedsYouCounts) {
  return { status: 'loaded' as const, counts };
}

export function NeedsYouCountsProvider({ children }: { children: ReactNode }) {
  const { read } = useAppRead(needsYouCountsRead(useSession()?.user.id), loadedCounts, { whenAppActive: true });
  const counts = read.status === 'loaded' ? read.counts : noCounts;

  const state = useMemo<NeedsYouCountsState>(
    () => ({
      total: counts.total,
      countOf: (deckId) => counts.decks.find((deck) => deck.deck_id === deckId)?.count ?? 0,
    }),
    [counts],
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

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

const countsRead = databaseRead(databaseFunctions.get_needs_you_counts);

export const needsYouCountsRead = { ...countsRead, key: [...needsYouKey, ...countsRead.key] };

export function loadedCounts(counts: NeedsYouCounts) {
  return { counts };
}

export function NeedsYouCountsProvider({ children }: { children: ReactNode }) {
  const userId = useSession()?.user.id;
  const { read } = useAppRead(userId ? needsYouCountsRead : null, loadedCounts, { key: [userId], whenAppActive: true });
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

import type { BuylistCard, BuylistPage, BuylistQuery } from '@mtgscan/supabase/buylist';
import type { PlannedSwap, PlannedSwapPage, PlannedSwapsQuery } from '@mtgscan/supabase/planned-swaps';
import { useMemo } from 'react';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';
import { useNeedsYouCounts } from '@/needs-you/needs-you-counts';

export type NeedsYouItem = { kind: 'planned_swap'; plannedSwap: PlannedSwap } | { kind: 'buylist_card'; buylistCard: BuylistCard };

type NeedsYouRead = { status: 'loaded'; items: NeedsYouItem[] };

function createdAtOf(item: NeedsYouItem) {
  return item.kind === 'planned_swap' ? item.plannedSwap.created_at : item.buylistCard.created_at;
}

async function readNeedsYou(deckId: string | undefined): Promise<NeedsYouRead> {
  const query: PlannedSwapsQuery & BuylistQuery = {
    ...(deckId ? { deck_id: deckId } : {}),
    status: 'open',
    order: 'oldest_first',
    limit: 50,
  };
  const [plannedSwaps, buylist] = await Promise.all([
    supabase.rpc('list_planned_swaps', { query }),
    supabase.rpc('list_buylist', { query }),
  ]);
  if (plannedSwaps.error || buylist.error) {
    throw plannedSwaps.error ?? buylist.error;
  }
  const items: NeedsYouItem[] = [
    ...(plannedSwaps.data as unknown as PlannedSwapPage).items.map((plannedSwap) => ({ kind: 'planned_swap' as const, plannedSwap })),
    ...(buylist.data as unknown as BuylistPage).items.map((buylistCard) => ({ kind: 'buylist_card' as const, buylistCard })),
  ];
  return { status: 'loaded', items: items.sort((a, b) => createdAtOf(a).localeCompare(createdAtOf(b))) };
}

export function useNeedsYou(deckId?: string) {
  const { reload: reloadCounts } = useNeedsYouCounts();
  const readOnce = useMemo(
    () => () => {
      reloadCounts();
      return readNeedsYou(deckId);
    },
    [deckId, reloadCounts],
  );
  return useFocusedRead(readOnce);
}

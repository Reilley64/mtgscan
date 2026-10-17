import type { BuylistCard, BuylistPage, BuylistQuery } from '@mtgscan/supabase/buylist';
import type { PlannedSwap, PlannedSwapPage, PlannedSwapsQuery } from '@mtgscan/supabase/planned-swaps';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

export type NeedsYouItem = { kind: 'planned_swap'; plannedSwap: PlannedSwap } | { kind: 'buylist_card'; buylistCard: BuylistCard };

type NeedsYouRead = { status: 'loaded'; items: NeedsYouItem[] };

const openPlannedSwaps: PlannedSwapsQuery = { status: 'open', order: 'oldest_first', limit: 50 };
const openBuylistCards: BuylistQuery = { status: 'open', order: 'oldest_first', limit: 50 };

function createdAtOf(item: NeedsYouItem) {
  return item.kind === 'planned_swap' ? item.plannedSwap.created_at : item.buylistCard.created_at;
}

async function readNeedsYou(): Promise<NeedsYouRead> {
  const [plannedSwaps, buylist] = await Promise.all([
    supabase.rpc('list_planned_swaps', { query: openPlannedSwaps }),
    supabase.rpc('list_buylist', { query: openBuylistCards }),
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

export function useNeedsYou() {
  return useFocusedRead(readNeedsYou);
}

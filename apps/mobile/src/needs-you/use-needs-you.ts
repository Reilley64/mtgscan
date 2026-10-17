import type { BuylistCard } from '@mtgscan/supabase/buylist';
import type { PlannedSwap, PlannedSwapsQuery } from '@mtgscan/supabase/planned-swaps';
import { useMemo } from 'react';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';
import { useNeedsYouCounts } from '@/needs-you/needs-you-counts';

export type NeedsYouItem = { kind: 'planned_swap'; id: string; plan: PlannedSwap } | { kind: 'buylist_card'; id: string; plan: BuylistCard };

type NeedsYouRead = { status: 'loaded'; items: NeedsYouItem[] };

type NeedsYouQuery = Pick<PlannedSwapsQuery, 'deck_id' | 'status' | 'order' | 'limit'>;

async function everyPage<Item>(name: 'list_planned_swaps' | 'list_buylist', query: NeedsYouQuery): Promise<Item[]> {
  const items: Item[] = [];
  let cursor: string | null = null;
  do {
    const { data, error } = await supabase.rpc(name, { query: cursor ? { ...query, cursor } : query });
    if (error) {
      throw error;
    }
    const page = data as unknown as { items: Item[]; next_cursor: string | null };
    items.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return items;
}

async function readNeedsYou(deckId: string | undefined): Promise<NeedsYouRead> {
  const query: NeedsYouQuery = { ...(deckId ? { deck_id: deckId } : {}), status: 'open', order: 'oldest_first', limit: 50 };
  const [plannedSwaps, buylistCards] = await Promise.all([
    everyPage<PlannedSwap>('list_planned_swaps', query),
    everyPage<BuylistCard>('list_buylist', query),
  ]);
  const items: NeedsYouItem[] = [
    ...plannedSwaps.map((plan) => ({ kind: 'planned_swap' as const, id: plan.planned_swap_id, plan })),
    ...buylistCards.map((plan) => ({ kind: 'buylist_card' as const, id: plan.buylist_card_id, plan })),
  ];
  return { status: 'loaded', items: items.sort((a, b) => a.plan.created_at.localeCompare(b.plan.created_at)) };
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

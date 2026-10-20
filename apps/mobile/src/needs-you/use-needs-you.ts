import type { BuylistCard, BuylistQuery } from '@mtgscan/supabase/buylist';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { PlannedSwap, PlannedSwapsQuery } from '@mtgscan/supabase/planned-swaps';

import { useSession } from '@/auth/session';
import { everyPage, pagedDatabaseRead, useReadAgain, useScreenRead } from '@/lib/read';
import { loadedCounts, needsYouCountsRead, needsYouKey } from '@/needs-you/needs-you-counts';

export type NeedsYouItem = { kind: 'planned_swap'; id: string; plan: PlannedSwap } | { kind: 'buylist_card'; id: string; plan: BuylistCard };

type NeedsYouQuery = Pick<PlannedSwapsQuery & BuylistQuery, 'deck_id' | 'status' | 'order' | 'limit'>;

function needsYouRead(deckId: string | undefined) {
  const query: NeedsYouQuery = { ...(deckId ? { deck_id: deckId } : {}), status: 'open', order: 'oldest_first', limit: 50 };
  return {
    key: [...needsYouKey, 'items', query],
    read: async () => {
      const [plannedSwaps, buylistCards] = await Promise.all([
        everyPage(pagedDatabaseRead(databaseFunctions.list_planned_swaps, query)),
        everyPage(pagedDatabaseRead(databaseFunctions.list_buylist, query)),
      ]);
      const items: NeedsYouItem[] = [
        ...plannedSwaps.map((plan) => ({ kind: 'planned_swap' as const, id: plan.planned_swap_id, plan })),
        ...buylistCards.map((plan) => ({ kind: 'buylist_card' as const, id: plan.buylist_card_id, plan })),
      ];
      return items.sort((a, b) => a.plan.created_at.localeCompare(b.plan.created_at));
    },
  };
}

function loadedItems(items: NeedsYouItem[]) {
  return { items };
}

export function useNeedsYou(deckId?: string) {
  const { read } = useScreenRead(needsYouRead(deckId), loadedItems);
  const userId = useSession()?.user.id;
  useScreenRead(userId ? needsYouCountsRead : null, loadedCounts, { key: [userId] });
  const readAgain = useReadAgain();
  return { read, reload: () => readAgain(needsYouKey) };
}

import type { BuylistCard, BuylistQuery } from '@mtgscan/supabase/buylist';
import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { PlannedSwap, PlannedSwapsQuery } from '@mtgscan/supabase/planned-swaps';
import { useMemo } from 'react';

import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';
import { useNeedsYouCounts } from '@/needs-you/needs-you-counts';

export type NeedsYouItem = { kind: 'planned_swap'; id: string; plan: PlannedSwap } | { kind: 'buylist_card'; id: string; plan: BuylistCard };

type NeedsYouRead = { status: 'loaded'; items: NeedsYouItem[] };

type NeedsYouQuery = Pick<PlannedSwapsQuery & BuylistQuery, 'deck_id' | 'status' | 'order' | 'limit'>;

type ReadPage<Item> = (cursor: string | null) => Promise<{ items: Item[]; next_cursor: string | null }>;

async function everyPage<Item>(readPage: ReadPage<Item>): Promise<Item[]> {
  const items: Item[] = [];
  let cursor: string | null = null;
  do {
    const page = await readPage(cursor);
    items.push(...page.items);
    cursor = page.next_cursor;
  } while (cursor);
  return items;
}

async function readNeedsYou(deckId: string | undefined): Promise<NeedsYouRead> {
  const query: NeedsYouQuery = { ...(deckId ? { deck_id: deckId } : {}), status: 'open', order: 'oldest_first', limit: 50 };
  const [plannedSwaps, buylistCards] = await Promise.all([
    everyPage(async (cursor) =>
      replyOf(await callDatabaseFunction(supabase, databaseFunctions.list_planned_swaps, cursor ? { ...query, cursor } : query)),
    ),
    everyPage(async (cursor) =>
      replyOf(await callDatabaseFunction(supabase, databaseFunctions.list_buylist, cursor ? { ...query, cursor } : query)),
    ),
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

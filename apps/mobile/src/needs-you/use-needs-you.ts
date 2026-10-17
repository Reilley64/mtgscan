import type { PlannedSwap, PlannedSwapPage, PlannedSwapsQuery } from '@mtgscan/supabase/planned-swaps';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type NeedsYouRead = { status: 'loaded'; plannedSwaps: PlannedSwap[] };

const openPlannedSwaps: PlannedSwapsQuery = { status: 'open', order: 'oldest_first', limit: 50 };

async function readNeedsYou(): Promise<NeedsYouRead> {
  const { data, error } = await supabase.rpc('list_planned_swaps', { query: openPlannedSwaps });
  if (error) {
    throw error;
  }
  return { status: 'loaded', plannedSwaps: (data as unknown as PlannedSwapPage).items };
}

export function useNeedsYou() {
  return useFocusedRead(readNeedsYou);
}

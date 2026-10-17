import { readDeckError } from '@mtgscan/supabase/decks';
import type { SwapInPlannedSwapRequest } from '@mtgscan/supabase/planned-swaps';

import { supabase } from '@/lib/supabase';
import { writeResultOf, type WriteResult } from '@/lib/write-result';

export async function swapInPlannedSwap(plannedSwapId: string): Promise<WriteResult | 'commander_limit'> {
  const request: SwapInPlannedSwapRequest = { planned_swap_id: plannedSwapId };
  const { error } = await supabase.rpc('swap_in_planned_swap', { request });
  const code = error && readDeckError(error).code;
  if (code === 'not_open') {
    return 'missing';
  }
  if (code === 'commander_limit') {
    return 'commander_limit';
  }
  return writeResultOf(error);
}

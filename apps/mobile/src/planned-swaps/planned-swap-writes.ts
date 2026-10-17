import { readDeckError } from '@mtgscan/supabase/decks';
import type { ClosePlannedSwapRequest, SwapInPlannedSwapRequest } from '@mtgscan/supabase/planned-swaps';

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

export async function closePlannedSwap(plannedSwapId: string): Promise<WriteResult> {
  const request: ClosePlannedSwapRequest = { planned_swap_id: plannedSwapId };
  const { error } = await supabase.rpc('close_planned_swap', { request });
  if (error && readDeckError(error).code === 'not_open') {
    return 'missing';
  }
  return writeResultOf(error);
}

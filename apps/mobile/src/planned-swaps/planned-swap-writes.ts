import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { supabase } from '@/lib/supabase';
import { writeResultOf, type WriteResult } from '@/lib/write-result';

export async function swapInPlannedSwap(plannedSwapId: string): Promise<WriteResult | 'commander_limit'> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.swap_in_planned_swap, { planned_swap_id: plannedSwapId });
  const code = result.status === 'refused' && result.refusal.code;
  if (code === 'not_open') {
    return 'missing';
  }
  if (code === 'commander_limit') {
    return 'commander_limit';
  }
  return writeResultOf(result);
}

export async function swapInPlannedSwaps(
  deckId: string,
  plannedSwapIds: string[],
): Promise<WriteResult | { thirdCommander: string }> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.swap_in_planned_swaps, {
    deck_id: deckId,
    planned_swap_ids: plannedSwapIds,
  });
  const refusal = result.status === 'refused' ? result.refusal : null;
  if (refusal?.code === 'not_open') {
    return 'missing';
  }
  const thirdCommander = refusal?.code === 'commander_limit' && refusal.field?.match(/^planned_swap_ids\[(\d+)\]$/);
  if (thirdCommander) {
    return { thirdCommander: plannedSwapIds[Number(thirdCommander[1])]! };
  }
  return writeResultOf(result);
}

export async function closePlannedSwap(plannedSwapId: string): Promise<WriteResult> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.close_planned_swap, { planned_swap_id: plannedSwapId });
  if (result.status === 'refused' && result.refusal.code === 'not_open') {
    return 'missing';
  }
  return writeResultOf(result);
}

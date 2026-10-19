import type { MarkBuylistCardBoughtRequest } from '@mtgscan/supabase/buylist';
import { callDatabaseFunction, type ErrorCodeOf } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { supabase } from '@/lib/supabase';
import { writeResultOf, type WriteResult } from '@/lib/write-result';

const outdatedCopyCodes: ErrorCodeOf<typeof databaseFunctions.mark_buylist_card_bought>[] = [
  'copy_not_free',
  'protected_copy',
  'invalid_argument',
];

export async function markBuylistCardBought(
  request: MarkBuylistCardBoughtRequest,
): Promise<WriteResult | 'outdated' | 'commander_limit'> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.mark_buylist_card_bought, request);
  const refusal = result.status === 'refused' ? result.refusal : null;
  if (refusal?.code === 'not_open' || (refusal?.code === 'not_found' && refusal.field === 'buylist_card_id')) {
    return 'missing';
  }
  if (refusal?.code === 'not_found' || (refusal && outdatedCopyCodes.includes(refusal.code))) {
    return 'outdated';
  }
  if (refusal?.code === 'commander_limit') {
    return 'commander_limit';
  }
  return writeResultOf(result);
}

export async function closeBuylistCard(buylistCardId: string): Promise<WriteResult> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.close_buylist_card, { buylist_card_id: buylistCardId });
  if (result.status === 'refused' && result.refusal.code === 'not_open') {
    return 'missing';
  }
  return writeResultOf(result);
}

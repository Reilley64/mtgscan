import type { CloseBuylistCardRequest, MarkBuylistCardBoughtRequest } from '@mtgscan/supabase/buylist';
import { readDeckError, type DeckErrorCode } from '@mtgscan/supabase/decks';

import { supabase } from '@/lib/supabase';
import { writeResultOf, type WriteResult } from '@/lib/write-result';

const outdatedCopyCodes: DeckErrorCode[] = ['copy_not_free', 'protected_copy', 'invalid_argument'];

export async function markBuylistCardBought(
  request: MarkBuylistCardBoughtRequest,
): Promise<WriteResult | 'outdated' | 'commander_limit'> {
  const { error } = await supabase.rpc('mark_buylist_card_bought', { request });
  const refusal = error && readDeckError(error);
  if (refusal?.code === 'not_open' || (refusal?.code === 'not_found' && refusal.field === 'buylist_card_id')) {
    return 'missing';
  }
  if (refusal?.code === 'not_found' || (refusal && outdatedCopyCodes.includes(refusal.code))) {
    return 'outdated';
  }
  if (refusal?.code === 'commander_limit') {
    return 'commander_limit';
  }
  return writeResultOf(error);
}

export async function closeBuylistCard(buylistCardId: string): Promise<WriteResult> {
  const request: CloseBuylistCardRequest = { buylist_card_id: buylistCardId };
  const { error } = await supabase.rpc('close_buylist_card', { request });
  if (error && readDeckError(error).code === 'not_open') {
    return 'missing';
  }
  return writeResultOf(error);
}

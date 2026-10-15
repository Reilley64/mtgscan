import type { CreateDeckRequest, CreatedDeck, MarkDeckUsedRequest } from '@mtgscan/supabase/decks';

import { supabase } from '@/lib/supabase';

export async function createDeck(name: string): Promise<CreatedDeck | null> {
  const request: CreateDeckRequest = { name };
  const { data, error } = await supabase.rpc('create_deck', { request });
  return error ? null : (data as unknown as CreatedDeck);
}

export async function markDeckUsed(deckId: string) {
  const request: MarkDeckUsedRequest = { deck_id: deckId };
  await supabase.rpc('mark_deck_used', { request });
}

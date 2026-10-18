import type { BasicLandCard, BasicLandCardList } from '@mtgscan/supabase/decks';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type BasicLandCardsRead = { status: 'loaded'; lands: BasicLandCard[] };

async function readBasicLandCards(): Promise<BasicLandCardsRead> {
  const { data, error } = await supabase.rpc('list_basic_land_cards');
  if (error) {
    throw error;
  }
  return { status: 'loaded', lands: (data as unknown as BasicLandCardList).items };
}

export function useBasicLandCards() {
  return useFocusedRead(readBasicLandCards);
}

import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { BasicLandCard } from '@mtgscan/supabase/decks';

import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type BasicLandCardsRead = { status: 'loaded'; lands: BasicLandCard[] };

async function readBasicLandCards(): Promise<BasicLandCardsRead> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.list_basic_land_cards);
  return { status: 'loaded', lands: replyOf(result).items };
}

export function useBasicLandCards() {
  return useFocusedRead(readBasicLandCards);
}

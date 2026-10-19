import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { BasicLandCard } from '@mtgscan/supabase/decks';

import { databaseRead, useScreenRead } from '@/lib/read';

const basicLandCardsRead = databaseRead(databaseFunctions.list_basic_land_cards);

function loadedLands({ items }: { items: BasicLandCard[] }) {
  return { status: 'loaded' as const, lands: items };
}

export function useBasicLandCards() {
  return useScreenRead(basicLandCardsRead, loadedLands);
}

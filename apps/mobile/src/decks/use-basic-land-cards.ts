import type { BasicLandCard } from '@mtgscan/supabase/collection';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { databaseRead, useScreenRead } from '@/lib/read';

const basicLandCardsRead = databaseRead(databaseFunctions.list_basic_land_cards);

function loadedLands({ items }: { items: BasicLandCard[] }) {
  return { lands: items };
}

export function useBasicLandCards() {
  return useScreenRead(basicLandCardsRead, loadedLands);
}

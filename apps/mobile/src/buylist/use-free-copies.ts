import type { FreeCopy } from '@mtgscan/supabase/buylist';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { databaseRead, useScreenRead } from '@/lib/read';

function loadedCopies({ items }: { items: FreeCopy[] }) {
  return { copies: items };
}

export function useFreeCopies(oracleId: string) {
  return useScreenRead(databaseRead(databaseFunctions.list_free_copies, { oracle_id: oracleId }), loadedCopies);
}

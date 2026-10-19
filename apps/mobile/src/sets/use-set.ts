import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { SetDetails } from '@mtgscan/supabase/sets';

import { databaseRead, useScreenRead } from '@/lib/read';

function loadedSet(set: SetDetails) {
  return { set };
}

export function useSet(code: string) {
  return useScreenRead(databaseRead(databaseFunctions.get_set, { code }), loadedSet);
}

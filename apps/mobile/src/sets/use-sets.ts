import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { SetListQuery } from '@mtgscan/supabase/sets';

import { pagedDatabaseRead, usePagedScreenRead } from '@/lib/read';

export function useSets(search: SetListQuery) {
  return usePagedScreenRead(pagedDatabaseRead(databaseFunctions.list_sets, search), { refused: ['invalid_argument'] });
}

import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { SetListQuery } from '@mtgscan/supabase/sets';

import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { usePagedRead } from '@/lib/use-paged-read';

async function readSets(search: SetListQuery, cursor: string | null) {
  return replyOf(await callDatabaseFunction(supabase, databaseFunctions.list_sets, { ...search, cursor }));
}

export function useSets(search: SetListQuery) {
  return usePagedRead(search, readSets);
}

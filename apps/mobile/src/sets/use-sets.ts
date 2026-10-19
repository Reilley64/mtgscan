import type { SetList, SetListQuery } from '@mtgscan/supabase/sets';

import { supabase } from '@/lib/supabase';
import { usePagedRead } from '@/lib/use-paged-read';

async function readSets(search: SetListQuery, cursor: string | null) {
  const query: SetListQuery = { ...search, cursor };
  const { data, error } = await supabase.rpc('list_sets', { query });
  if (error) {
    throw error;
  }
  return data as unknown as SetList;
}

export function useSets(search: SetListQuery) {
  return usePagedRead(search, readSets);
}

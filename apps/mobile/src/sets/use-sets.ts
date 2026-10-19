import type { CardSet, SetList } from '@mtgscan/supabase/sets';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type SetsRead = { status: 'loaded'; sets: CardSet[] };

async function readSets(): Promise<SetsRead> {
  const { data, error } = await supabase.rpc('list_sets');
  if (error) {
    throw error;
  }
  return { status: 'loaded', sets: (data as unknown as SetList).items };
}

export function useSets() {
  return useFocusedRead(readSets);
}

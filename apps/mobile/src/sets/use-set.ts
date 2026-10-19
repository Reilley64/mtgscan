import type { SetDetails, SetQuery } from '@mtgscan/supabase/sets';
import { useMemo } from 'react';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type SetRead = { status: 'loaded'; set: SetDetails };

async function readSet(code: string): Promise<SetRead> {
  const query: SetQuery = { code };
  const { data, error } = await supabase.rpc('get_set', { query });
  if (error) {
    throw error;
  }
  return { status: 'loaded', set: data as unknown as SetDetails };
}

export function useSet(code: string) {
  const readOnce = useMemo(() => () => readSet(code), [code]);
  return useFocusedRead(readOnce);
}

import type { FreeCopies, FreeCopiesQuery, FreeCopy } from '@mtgscan/supabase/buylist';
import { useMemo } from 'react';

import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type FreeCopiesRead = { status: 'loaded'; copies: FreeCopy[] };

async function readFreeCopies(query: FreeCopiesQuery): Promise<FreeCopiesRead> {
  const { data, error } = await supabase.rpc('list_free_copies', { query });
  if (error) {
    throw error;
  }
  return { status: 'loaded', copies: (data as unknown as FreeCopies).items };
}

export function useFreeCopies(oracleId: string) {
  const readOnce = useMemo(() => () => readFreeCopies({ oracle_id: oracleId }), [oracleId]);
  return useFocusedRead(readOnce);
}

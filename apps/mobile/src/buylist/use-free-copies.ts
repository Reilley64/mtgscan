import type { FreeCopiesQuery, FreeCopy } from '@mtgscan/supabase/buylist';
import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import { useMemo } from 'react';

import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type FreeCopiesRead = { status: 'loaded'; copies: FreeCopy[] };

async function readFreeCopies(query: FreeCopiesQuery): Promise<FreeCopiesRead> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.list_free_copies, query);
  return { status: 'loaded', copies: replyOf(result).items };
}

export function useFreeCopies(oracleId: string) {
  const readOnce = useMemo(() => () => readFreeCopies({ oracle_id: oracleId }), [oracleId]);
  return useFocusedRead(readOnce);
}

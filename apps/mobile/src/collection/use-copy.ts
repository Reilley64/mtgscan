import type { CopyDetails } from '@mtgscan/supabase/collection';
import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import { useMemo } from 'react';

import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type CopyRead = { status: 'missing' } | { status: 'loaded'; copy: CopyDetails };

export async function readCopy(copyId: string): Promise<CopyRead> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.get_copy, { copy_id: copyId });
  if (result.status === 'refused' && result.refusal.code === 'not_found') {
    return { status: 'missing' };
  }
  return { status: 'loaded', copy: replyOf(result) };
}

export function useCopy(copyId: string) {
  const readOnce = useMemo(() => () => readCopy(copyId), [copyId]);
  return useFocusedRead(readOnce);
}

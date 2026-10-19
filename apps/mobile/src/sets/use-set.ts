import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';
import type { SetDetails } from '@mtgscan/supabase/sets';
import { useMemo } from 'react';

import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { useFocusedRead } from '@/lib/use-focused-read';

type SetRead = { status: 'loaded'; set: SetDetails };

async function readSet(code: string): Promise<SetRead> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.get_set, { code });
  return { status: 'loaded', set: replyOf(result) };
}

export function useSet(code: string) {
  const readOnce = useMemo(() => () => readSet(code), [code]);
  return useFocusedRead(readOnce);
}

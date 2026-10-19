import type { CopyUserTagRequest } from '@mtgscan/supabase/collection';
import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { supabase } from '@/lib/supabase';
import { writeResultOf, type WriteResult } from '@/lib/write-result';

export async function setCopyProtected(copyId: string, isProtected: boolean): Promise<WriteResult> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.set_copy_protected, { copy_id: copyId, protected: isProtected });
  return writeResultOf(result);
}

export async function deleteCopy(copyId: string, movePlannedSwap: boolean): Promise<WriteResult | 'held'> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.delete_copy, { copy_id: copyId, move_planned_swap: movePlannedSwap });
  if (result.status === 'refused' && result.refusal.code === 'copy_held') {
    return 'held';
  }
  return writeResultOf(result);
}

export async function setCopyUserTag(request: CopyUserTagRequest): Promise<WriteResult> {
  return writeResultOf(await callDatabaseFunction(supabase, databaseFunctions.set_copy_user_tag, request));
}

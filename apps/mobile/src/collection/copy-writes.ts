import type { CopyProtectedRequest, CopyUserTagRequest, DeleteCopyRequest } from '@mtgscan/supabase/collection';

import { supabase } from '@/lib/supabase';
import { writeResultOf, type WriteResult } from '@/lib/write-result';

export async function setCopyProtected(copyId: string, isProtected: boolean): Promise<WriteResult> {
  const request: CopyProtectedRequest = { copy_id: copyId, protected: isProtected };
  const { error } = await supabase.rpc('set_copy_protected', { request });
  return writeResultOf(error);
}

export async function deleteCopy(copyId: string, movePlannedSwap: boolean): Promise<WriteResult | 'held'> {
  const request: DeleteCopyRequest = { copy_id: copyId, move_planned_swap: movePlannedSwap };
  const { error } = await supabase.rpc('delete_copy', { request });
  if (error?.code === 'copy_held') {
    return 'held';
  }
  return writeResultOf(error);
}

export async function setCopyUserTag(request: CopyUserTagRequest): Promise<WriteResult> {
  const { error } = await supabase.rpc('set_copy_user_tag', { request });
  return writeResultOf(error);
}

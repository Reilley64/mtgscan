import type { CopyProtectedRequest, CopyUserTagRequest, DeleteCopyRequest } from '@mtgscan/supabase/collection';

import { supabase } from '@/lib/supabase';
import { writeResultOf, type WriteResult } from '@/lib/write-result';

export async function setCopyProtected(copyId: string, isProtected: boolean): Promise<WriteResult> {
  const request: CopyProtectedRequest = { copy_id: copyId, protected: isProtected };
  const { error } = await supabase.rpc('set_copy_protected', { request });
  return writeResultOf(error);
}

export async function deleteCopy(copyId: string, held: boolean): Promise<WriteResult> {
  const request: DeleteCopyRequest = held ? { copy_id: copyId, held_copy_id: copyId } : { copy_id: copyId };
  const { error } = await supabase.rpc('delete_copy', { request });
  if (error?.code === 'copy_held') {
    return 'missing';
  }
  return writeResultOf(error);
}

export async function setCopyUserTag(request: CopyUserTagRequest): Promise<WriteResult> {
  const { error } = await supabase.rpc('set_copy_user_tag', { request });
  return writeResultOf(error);
}

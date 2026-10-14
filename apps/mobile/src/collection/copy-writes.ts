import type { CopyProtectedRequest, CopyUserTagRequest, DeleteCopyRequest } from '@mtgscan/supabase/collection';
import { readSearchError } from '@mtgscan/supabase/search';

import { supabase } from '@/lib/supabase';

export type CopyWriteResult = 'done' | 'missing' | 'failed';

function resultOf(error: Parameters<typeof readSearchError>[0] | null): CopyWriteResult {
  if (!error) {
    return 'done';
  }
  return readSearchError(error).code === 'not_found' ? 'missing' : 'failed';
}

export async function setCopyProtected(copyId: string, isProtected: boolean): Promise<CopyWriteResult> {
  const request: CopyProtectedRequest = { copy_id: copyId, protected: isProtected };
  const { error } = await supabase.rpc('set_copy_protected', { request });
  return resultOf(error);
}

export async function deleteCopy(copyId: string): Promise<CopyWriteResult> {
  const request: DeleteCopyRequest = { copy_id: copyId };
  const { error } = await supabase.rpc('delete_copy', { request });
  return resultOf(error);
}

export async function setCopyUserTag(request: CopyUserTagRequest): Promise<CopyWriteResult> {
  const { error } = await supabase.rpc('set_copy_user_tag', { request });
  return resultOf(error);
}

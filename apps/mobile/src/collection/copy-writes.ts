import type { DeleteCopyRequest } from '@mtgscan/supabase/collection';
import { readSearchError } from '@mtgscan/supabase/search';

import { supabase } from '@/lib/supabase';

export type CopyWrite = 'done' | 'missing' | 'failed';

export async function deleteCopy(copyId: string): Promise<CopyWrite> {
  const request: DeleteCopyRequest = { copy_id: copyId };
  const { error } = await supabase.rpc('delete_copy', { request });
  if (!error) {
    return 'done';
  }
  return readSearchError(error).code === 'not_found' ? 'missing' : 'failed';
}

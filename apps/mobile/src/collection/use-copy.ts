import type { CopyDetails } from '@mtgscan/supabase/collection';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { databaseRead, useScreenRead } from '@/lib/read';

function loadedCopy(copy: CopyDetails) {
  return { copy };
}

export function useCopy(copyId: string) {
  const { read, reload } = useScreenRead(databaseRead(databaseFunctions.get_copy, { copy_id: copyId }), loadedCopy, {
    refused: ['not_found'],
  });
  return { read: read.status === 'refused' ? { status: 'missing' as const } : read, reload };
}

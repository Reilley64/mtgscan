import type { CollectionCopyPage, CollectionQuery } from '@mtgscan/supabase/collection';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { pagedDatabaseRead, usePagedScreenRead, type PagedRead } from '@/lib/read';

export type BinderRead = PagedRead<CollectionCopyPage, 'invalid_argument'>;

export function useCollectionCopies(search: CollectionQuery | null) {
  const { read, reload, loadMore } = usePagedScreenRead(search && pagedDatabaseRead(databaseFunctions.search_collection, search), {
    refused: ['invalid_argument'],
    restartsOnFocus: true,
  });
  return { binder: read, reload, loadMore };
}

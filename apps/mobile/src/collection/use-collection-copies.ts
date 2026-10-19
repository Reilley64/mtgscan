import type { CollectionCopyPage, CollectionQuery } from '@mtgscan/supabase/collection';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { pagedDatabaseRead, usePagedScreenRead, type PagedRead, type PagedServerRead } from '@/lib/read';

export type BinderRead = PagedRead<CollectionCopyPage, 'invalid_argument'>;

function collectionCopies(search: CollectionQuery) {
  const { readPage, ...pages } = pagedDatabaseRead(databaseFunctions.search_collection, { ...search, rows: 'copies' });
  return {
    ...pages,
    readPage: async (cursor) => {
      const page = await readPage(cursor);
      return { ...page, items: page.items.filter((row) => 'copy_id' in row) };
    },
  } satisfies PagedServerRead<CollectionCopyPage, string>;
}

export function useCollectionCopies(search: CollectionQuery | null) {
  const { read, reload, loadMore } = usePagedScreenRead(search && collectionCopies(search), { refused: ['invalid_argument'] });
  return { binder: read, reload, loadMore };
}

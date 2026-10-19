import type { CollectionCopyRow, CollectionPage, CollectionQuery } from '@mtgscan/supabase/collection';
import { callDatabaseFunction } from '@mtgscan/supabase/database-function';
import { databaseFunctions } from '@mtgscan/supabase/database-functions';

import { replyOf } from '@/lib/database-reply';
import { supabase } from '@/lib/supabase';
import { usePagedRead, type PagedRead } from '@/lib/use-paged-read';

export type BinderRead = PagedRead<CollectionPage<CollectionCopyRow>>;

async function readCollectionCopies(search: CollectionQuery, cursor: string | null): Promise<CollectionPage<CollectionCopyRow>> {
  const result = await callDatabaseFunction(supabase, databaseFunctions.search_collection, { ...search, rows: 'copies', cursor });
  const page = replyOf(result);
  return { ...page, items: page.items.filter((row) => 'copy_id' in row) };
}

export function useCollectionCopies(search: CollectionQuery | null) {
  const { read, reload, loadMore } = usePagedRead(search, readCollectionCopies);
  return { binder: read, reload, loadMore };
}

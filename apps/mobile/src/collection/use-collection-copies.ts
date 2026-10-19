import type { CollectionCopyRow, CollectionPage, CollectionQuery } from '@mtgscan/supabase/collection';

import { supabase } from '@/lib/supabase';
import { usePagedRead, type PagedRead } from '@/lib/use-paged-read';

export type BinderRead = PagedRead<CollectionPage<CollectionCopyRow>>;

async function readCollectionCopies(search: CollectionQuery, cursor: string | null) {
  const query: CollectionQuery = { ...search, rows: 'copies', cursor };
  const { data, error } = await supabase.rpc('search_collection', { query });
  if (error) {
    throw error;
  }
  return data as unknown as CollectionPage<CollectionCopyRow>;
}

export function useCollectionCopies(search: CollectionQuery | null) {
  const { read, reload, loadMore } = usePagedRead(search, readCollectionCopies);
  return { binder: read, reload, loadMore };
}

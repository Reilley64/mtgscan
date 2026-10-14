import { createContext, use, type ReactNode } from 'react';

import { useCollectionSearch } from '@/collection/use-collection-search';

type CollectionSearch = ReturnType<typeof useCollectionSearch>;

const CollectionSearchContext = createContext<CollectionSearch | null>(null);

export function CollectionSearchProvider({ children }: { children: ReactNode }) {
  return <CollectionSearchContext value={useCollectionSearch()}>{children}</CollectionSearchContext>;
}

export function useCollectionSearchState() {
  const search = use(CollectionSearchContext);
  if (!search) {
    throw new Error('useCollectionSearchState needs a CollectionSearchProvider');
  }
  return search;
}

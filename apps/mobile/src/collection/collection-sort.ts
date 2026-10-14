import type { CollectionQuery, CollectionSort } from '@mtgscan/supabase/collection';

export type SortDirection = 'asc' | 'desc';

type DirectedSort = Exclude<CollectionSort, 'relevance' | 'edhrec_rank'>;

export type CollectionOrder = { sort: 'relevance' } | { sort: DirectedSort; direction: SortDirection };

type DirectedSortRule = { title: string; firstDirection: SortDirection; directions: Record<SortDirection, string> };

const directedSorts: Record<DirectedSort, DirectedSortRule> = {
  added: { title: 'Recently added', firstDirection: 'desc', directions: { desc: 'newest first', asc: 'oldest first' } },
  name: { title: 'Name', firstDirection: 'asc', directions: { asc: 'A to Z', desc: 'Z to A' } },
  price: { title: 'Price', firstDirection: 'desc', directions: { desc: 'high to low', asc: 'low to high' } },
  mana_value: { title: 'Mana value', firstDirection: 'asc', directions: { asc: 'low to high', desc: 'high to low' } },
  release_date: { title: 'Release date', firstDirection: 'desc', directions: { desc: 'newest first', asc: 'oldest first' } },
};

export const defaultCollectionOrder: CollectionOrder = { sort: 'relevance' };

export const collectionSorts: { sort: CollectionOrder['sort']; title: string }[] = [
  { sort: 'relevance', title: 'Relevance' },
  ...(Object.entries(directedSorts) as [DirectedSort, DirectedSortRule][]).map(([sort, { title }]) => ({ sort, title })),
];

export function nextCollectionOrder(current: CollectionOrder, sort: CollectionOrder['sort']): CollectionOrder {
  if (sort === 'relevance') {
    return defaultCollectionOrder;
  }
  if (current.sort === sort) {
    return { sort, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { sort, direction: directedSorts[sort].firstDirection };
}

export function spokenCollectionOrder(order: CollectionOrder) {
  if (order.sort === 'relevance') {
    return 'Relevance';
  }
  const { title, directions } = directedSorts[order.sort];
  return `${title}, ${directions[order.direction]}`;
}

export function collectionOrderQuery(order: CollectionOrder): Pick<CollectionQuery, 'sort' | 'sort_order'> {
  return order.sort === 'relevance' ? {} : { sort: order.sort, sort_order: order.direction };
}

import type { CollectionQuery, CollectionSort } from '@mtgscan/supabase/collection';

import { nextSortOrder, sortChoices, spokenSortOrder, type SortOrder } from '@/lib/sort-order';

type DirectedCollectionSort = Exclude<CollectionSort, 'relevance' | 'edhrec_rank'>;

export type CollectionOrder = { sort: 'relevance' } | SortOrder<DirectedCollectionSort>;

export const defaultCollectionOrder: CollectionOrder = { sort: 'relevance' };

export const collectionSorts: { sort: CollectionOrder['sort']; title: string }[] = [
  { sort: 'relevance', title: 'Relevance' },
  ...sortChoices<DirectedCollectionSort>(['added', 'name', 'price', 'mana_value', 'release_date']),
];

export function nextCollectionOrder(current: CollectionOrder, sort: CollectionOrder['sort']): CollectionOrder {
  return sort === 'relevance' ? defaultCollectionOrder : nextSortOrder(current, sort);
}

export function spokenCollectionOrder(order: CollectionOrder) {
  return order.sort === 'relevance' ? 'Relevance' : spokenSortOrder(order);
}

export function collectionOrderQuery(order: CollectionOrder): Pick<CollectionQuery, 'sort' | 'sort_order'> {
  return order.sort === 'relevance' ? {} : { sort: order.sort, sort_order: order.direction };
}

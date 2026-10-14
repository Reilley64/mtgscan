import type { CollectionQuery, CollectionSort } from '@mtgscan/supabase/collection';
import type { SFSymbol } from 'expo-symbols';

type SortOrder = 'asc' | 'desc';

export type CollectionOrder = { sort: 'relevance' } | { sort: Exclude<CollectionSort, 'relevance' | 'edhrec_rank'>; order: SortOrder };

type OrderedSort = Extract<CollectionOrder, { order: SortOrder }>['sort'];

type SortChoice = { title: string; first: SortOrder; directions: Record<SortOrder, string> };

const orderedSorts: Record<OrderedSort, SortChoice> = {
  added: { title: 'Recently added', first: 'desc', directions: { desc: 'newest first', asc: 'oldest first' } },
  name: { title: 'Name', first: 'asc', directions: { asc: 'A to Z', desc: 'Z to A' } },
  price: { title: 'Price', first: 'desc', directions: { desc: 'high to low', asc: 'low to high' } },
  mana_value: { title: 'Mana value', first: 'asc', directions: { asc: 'low to high', desc: 'high to low' } },
  release_date: { title: 'Release date', first: 'desc', directions: { desc: 'newest first', asc: 'oldest first' } },
};

const directionSymbols: Record<SortOrder, SFSymbol> = { asc: 'arrow.up', desc: 'arrow.down' };

export const defaultCollectionOrder: CollectionOrder = { sort: 'relevance' };

function picked(current: CollectionOrder, sort: OrderedSort): CollectionOrder {
  if (current.sort === sort) {
    return { sort, order: current.order === 'asc' ? 'desc' : 'asc' };
  }
  return { sort, order: orderedSorts[sort].first };
}

export function collectionOrderChoices(current: CollectionOrder, onChange: (order: CollectionOrder) => void) {
  return [
    { title: 'Relevance', checked: current.sort === 'relevance', onSelect: () => onChange(defaultCollectionOrder) },
    ...(Object.entries(orderedSorts) as [OrderedSort, SortChoice][]).map(([sort, { title }]) => ({
      title,
      checked: current.sort === sort,
      symbol: current.sort === sort ? directionSymbols[current.order] : undefined,
      onSelect: () => onChange(picked(current, sort)),
    })),
  ];
}

export function spokenCollectionOrder(order: CollectionOrder) {
  if (order.sort === 'relevance') {
    return 'Relevance';
  }
  const { title, directions } = orderedSorts[order.sort];
  return `${title}, ${directions[order.order]}`;
}

export function collectionOrderQuery(order: CollectionOrder): Pick<CollectionQuery, 'sort' | 'sort_order'> {
  return order.sort === 'relevance' ? {} : { sort: order.sort, sort_order: order.order };
}

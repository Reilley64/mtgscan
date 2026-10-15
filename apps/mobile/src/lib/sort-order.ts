export type SortDirection = 'asc' | 'desc';

export type DirectedSort = 'added' | 'name' | 'price' | 'mana_value' | 'release_date';

export type SortOrder<Sort extends DirectedSort = DirectedSort> = { sort: Sort; direction: SortDirection };

type DirectedSortRule = { title: string; firstDirection: SortDirection; directions: Record<SortDirection, string> };

const directedSorts: Record<DirectedSort, DirectedSortRule> = {
  added: { title: 'Recently added', firstDirection: 'desc', directions: { desc: 'newest first', asc: 'oldest first' } },
  name: { title: 'Name', firstDirection: 'asc', directions: { asc: 'A to Z', desc: 'Z to A' } },
  price: { title: 'Price', firstDirection: 'desc', directions: { desc: 'high to low', asc: 'low to high' } },
  mana_value: { title: 'Mana value', firstDirection: 'asc', directions: { asc: 'low to high', desc: 'high to low' } },
  release_date: { title: 'Release date', firstDirection: 'desc', directions: { desc: 'newest first', asc: 'oldest first' } },
};

export function sortChoices<Sort extends DirectedSort>(sorts: Sort[]) {
  return sorts.map((sort) => ({ sort, title: directedSorts[sort].title }));
}

export function nextSortOrder<Sort extends DirectedSort>(current: { sort: string; direction?: SortDirection }, sort: Sort): SortOrder<Sort> {
  if (current.sort === sort && current.direction) {
    return { sort, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  }
  return { sort, direction: directedSorts[sort].firstDirection };
}

export function spokenSortOrder({ sort, direction }: SortOrder) {
  const { title, directions } = directedSorts[sort];
  return `${title}, ${directions[direction]}`;
}

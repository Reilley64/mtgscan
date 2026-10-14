import type { SFSymbol } from 'expo-symbols';

import { FloatingMenuButton } from '@/components/atoms/floating-menu-button';
import {
  collectionSorts,
  nextCollectionOrder,
  spokenCollectionOrder,
  type CollectionOrder,
  type SortDirection,
} from '@/collection/collection-sort';

const directionSymbols: Record<SortDirection, SFSymbol> = { asc: 'arrow.up', desc: 'arrow.down' };

type CollectionSortButtonProps = {
  order: CollectionOrder;
  onChange: (order: CollectionOrder) => void;
};

export function CollectionSortButton({ order, onChange }: CollectionSortButtonProps) {
  return (
    <FloatingMenuButton
      symbol="arrow.up.arrow.down"
      active={order.sort !== 'relevance'}
      accessibilityLabel={`Sort, ${spokenCollectionOrder(order)}`}
      menuTitle="Sort by"
      choices={collectionSorts.map(({ sort, title }) => ({
        title,
        checked: order.sort === sort,
        symbol: order.sort === sort && 'direction' in order ? directionSymbols[order.direction] : undefined,
        onSelect: () => onChange(nextCollectionOrder(order, sort)),
      }))}
    />
  );
}

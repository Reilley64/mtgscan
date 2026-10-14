import { FloatingMenuButton } from '@/components/atoms/floating-menu-button';
import { collectionOrderChoices, spokenCollectionOrder, type CollectionOrder } from '@/collection/collection-sort';

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
      choices={collectionOrderChoices(order, onChange)}
    />
  );
}

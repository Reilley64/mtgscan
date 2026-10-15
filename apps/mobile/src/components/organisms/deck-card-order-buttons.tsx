import { GroupButton } from '@/components/molecules/group-button';
import { SortButton } from '@/components/molecules/sort-button';
import {
  deckGroupings,
  deckSorts,
  defaultDeckGrouping,
  isDefaultDeckOrder,
  type DeckGrouping,
  type DeckOrder,
} from '@/decks/deck-groups';
import { nextSortOrder, spokenSortOrder } from '@/lib/sort-order';

type DeckCardOrderButtonsProps = {
  grouping: DeckGrouping;
  order: DeckOrder;
  onChangeGrouping: (grouping: DeckGrouping) => void;
  onChangeOrder: (order: DeckOrder) => void;
};

export function DeckCardOrderButtons({ grouping, order, onChangeGrouping, onChangeOrder }: DeckCardOrderButtonsProps) {
  return (
    <>
      <GroupButton groupings={deckGroupings} grouping={grouping} active={grouping !== defaultDeckGrouping} onSelect={onChangeGrouping} />
      <SortButton
        sorts={deckSorts}
        order={order}
        spokenOrder={spokenSortOrder(order)}
        active={!isDefaultDeckOrder(order)}
        onSelect={(sort) => onChangeOrder(nextSortOrder(order, sort))}
      />
    </>
  );
}

import type { Deck, DeckCard } from '@mtgscan/supabase/decks';

import { sheenOf, spokenCopy } from '@/collection/copy-labels';
import { FloatingMenuButton } from '@/components/atoms/floating-menu-button';
import { Text } from '@/components/atoms/text';
import { CardGrid } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { EmptyState } from '@/components/molecules/empty-state';
import { EmptyBinderSlots } from '@/components/molecules/empty-state-illustrations';
import { SheetSection } from '@/components/molecules/sheet-section';
import { SortButton } from '@/components/molecules/sort-button';
import {
  deckCommanders,
  deckGroupings,
  deckSorts,
  defaultDeckGrouping,
  groupingTitle,
  isDefaultDeckOrder,
  mainDeckGroups,
  type DeckGrouping,
  type DeckOrder,
} from '@/decks/deck-groups';
import { nextSortOrder, spokenSortOrder } from '@/lib/sort-order';

type DeckCardsProps = {
  deck: Deck;
  grouping: DeckGrouping;
  order: DeckOrder;
  onOpenCard: (card: DeckCard) => void;
  onOpenCollection: () => void;
};

function DeckCardGrid({ cards, onOpenCard }: { cards: DeckCard[]; onOpenCard: (card: DeckCard) => void }) {
  return (
    <CardGrid>
      {cards.map((card) => (
        <CardTile
          key={card.copy_id}
          uri={card.image_uris[0]}
          sheen={sheenOf(card.finish)}
          accessibilityLabel={spokenCopy(card).join(', ')}
          onPress={() => onOpenCard(card)}
        />
      ))}
    </CardGrid>
  );
}

export function DeckCards({ deck, grouping, order, onOpenCard, onOpenCollection }: DeckCardsProps) {
  const commanders = deckCommanders(deck.cards);
  return (
    <>
      <SheetSection title="Commander" count={commanders.length > 0 ? commanders.length : undefined}>
        {commanders.length > 0 ? (
          <DeckCardGrid cards={commanders} onOpenCard={onOpenCard} />
        ) : (
          <Text className="text-text-muted">No commander yet.</Text>
        )}
      </SheetSection>
      {deck.card_count === 0 ? (
        <EmptyState
          illustration={<EmptyBinderSlots rows={1} />}
          title="No cards yet"
          message="Add cards from a copy's page in your collection."
          action={{ label: 'Open Collection', onPress: onOpenCollection }}
        />
      ) : (
        mainDeckGroups(deck.cards, grouping, order).map((group) => (
          <SheetSection key={group.title} title={group.title} count={group.cards.length}>
            <DeckCardGrid cards={group.cards} onOpenCard={onOpenCard} />
          </SheetSection>
        ))
      )}
    </>
  );
}

type DeckCardOrderButtonsProps = {
  grouping: DeckGrouping;
  order: DeckOrder;
  onChangeGrouping: (grouping: DeckGrouping) => void;
  onChangeOrder: (order: DeckOrder) => void;
};

export function DeckCardOrderButtons({ grouping, order, onChangeGrouping, onChangeOrder }: DeckCardOrderButtonsProps) {
  return (
    <>
      <FloatingMenuButton
        symbol="rectangle.3.group"
        active={grouping !== defaultDeckGrouping}
        accessibilityLabel={`Group, ${groupingTitle(grouping)}`}
        menuTitle="Group by"
        choices={deckGroupings.map((choice) => ({
          title: choice.title,
          checked: choice.grouping === grouping,
          onSelect: () => onChangeGrouping(choice.grouping),
        }))}
      />
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

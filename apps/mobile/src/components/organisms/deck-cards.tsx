import type { Deck, DeckCard } from '@mtgscan/supabase/decks';

import { sheenOf, spokenCopy } from '@/collection/copy-labels';
import type { MenuAction } from '@/components/atoms/menu-button';
import { Text } from '@/components/atoms/text';
import { CardGrid } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { EmptyState } from '@/components/molecules/empty-state';
import { EmptyBinderSlots } from '@/components/molecules/empty-state-illustrations';
import { SheetSection } from '@/components/molecules/sheet-section';
import { deckCommanders, mainDeckGroups, type DeckGrouping, type DeckOrder } from '@/decks/deck-groups';

type CardHandlers = {
  onOpenCard: (card: DeckCard) => void;
  menuActionsOf: (card: DeckCard) => MenuAction[];
};

type DeckCardsProps = CardHandlers & {
  deck: Deck;
  grouping: DeckGrouping;
  order: DeckOrder;
  onOpenCollection: () => void;
};

function DeckCardGrid({ cards, onOpenCard, menuActionsOf }: CardHandlers & { cards: DeckCard[] }) {
  return (
    <CardGrid>
      {cards.map((card) => (
        <CardTile
          key={card.copy_id}
          uri={card.image_uris[0]}
          sheen={sheenOf(card.finish)}
          accessibilityLabel={spokenCopy(card).join(', ')}
          menuActions={menuActionsOf(card)}
          onPress={() => onOpenCard(card)}
        />
      ))}
    </CardGrid>
  );
}

export function DeckCards({ deck, grouping, order, onOpenCard, menuActionsOf, onOpenCollection }: DeckCardsProps) {
  const commanders = deckCommanders(deck.cards);
  return (
    <>
      <SheetSection title="Commander" count={commanders.length > 0 ? commanders.length : undefined}>
        {commanders.length > 0 ? (
          <DeckCardGrid cards={commanders} onOpenCard={onOpenCard} menuActionsOf={menuActionsOf} />
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
            <DeckCardGrid cards={group.cards} onOpenCard={onOpenCard} menuActionsOf={menuActionsOf} />
          </SheetSection>
        ))
      )}
    </>
  );
}

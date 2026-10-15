import type { Deck, DeckBasicLand, DeckCard } from '@mtgscan/supabase/decks';

import { sheenOf, spokenCopy } from '@/collection/copy-labels';
import type { MenuAction } from '@/components/atoms/menu-button';
import { Button } from '@/components/atoms/button';
import { Text } from '@/components/atoms/text';
import { CardGrid } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { EmptyState } from '@/components/molecules/empty-state';
import { EmptyBinderSlots } from '@/components/molecules/empty-state-illustrations';
import { SheetSection } from '@/components/molecules/sheet-section';
import { basicLandTotal } from '@/decks/basic-lands';
import { deckCommanders, mainDeckGroups, type DeckGrouping, type DeckOrder } from '@/decks/deck-groups';
import { violationCardKeys } from '@/decks/violation-cards';

type CardHandlers = {
  onOpenCard: (card: DeckCard) => void;
  menuActionsOf: (card: DeckCard) => MenuAction[];
};

type DeckCardsProps = CardHandlers & {
  deck: Deck;
  grouping: DeckGrouping;
  order: DeckOrder;
  onEditBasicLands: () => void;
  onOpenCollection: () => void;
};

type DeckCardGridProps = CardHandlers & {
  cards: DeckCard[];
  violationCards: Set<string>;
};

function DeckCardGrid({ cards, violationCards, onOpenCard, menuActionsOf }: DeckCardGridProps) {
  return (
    <CardGrid>
      {cards.map((card) => (
        <CardTile
          key={card.copy_id}
          uri={card.image_uris[0]}
          sheen={sheenOf(card.finish)}
          accessibilityLabel={spokenCopy(card).join(', ')}
          inViolation={violationCards.has(card.copy_id)}
          menuActions={menuActionsOf(card)}
          onPress={() => onOpenCard(card)}
        />
      ))}
    </CardGrid>
  );
}

type BasicLandsProps = {
  lands: DeckBasicLand[];
  violationCards: Set<string>;
  onEdit: () => void;
};

function BasicLands({ lands, violationCards, onEdit }: BasicLandsProps) {
  const total = basicLandTotal(lands);
  const shownLands = lands.filter((land) => land.count > 0);

  return (
    <SheetSection
      title="Basic lands"
      count={total > 0 ? total : undefined}
      action={
        <Button onPress={onEdit}>
          <Text>Edit</Text>
        </Button>
      }>
      {shownLands.length > 0 ? (
        <CardGrid>
          {shownLands.map((land) => (
            <CardTile
              key={land.name}
              uri={land.image_uris[0]}
              count={land.count}
              accessibilityLabel={`${land.name}, ${land.count}`}
              inViolation={land.oracle_id !== null && violationCards.has(land.oracle_id)}
            />
          ))}
        </CardGrid>
      ) : null}
    </SheetSection>
  );
}

export function DeckCards({ deck, grouping, order, onEditBasicLands, onOpenCard, menuActionsOf, onOpenCollection }: DeckCardsProps) {
  const commanders = deckCommanders(deck.cards);
  const violationCards = violationCardKeys(deck.evaluation);
  return (
    <>
      <SheetSection title="Commander" count={commanders.length > 0 ? commanders.length : undefined}>
        {commanders.length > 0 ? (
          <DeckCardGrid cards={commanders} violationCards={violationCards} onOpenCard={onOpenCard} menuActionsOf={menuActionsOf} />
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
            <DeckCardGrid cards={group.cards} violationCards={violationCards} onOpenCard={onOpenCard} menuActionsOf={menuActionsOf} />
          </SheetSection>
        ))
      )}
      <BasicLands lands={deck.basic_lands} violationCards={violationCards} onEdit={onEditBasicLands} />
    </>
  );
}

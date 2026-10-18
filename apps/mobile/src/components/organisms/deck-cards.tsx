import type { Deck, DeckCard } from '@mtgscan/supabase/decks';

import { sheenOf, spokenCopy } from '@/collection/copy-labels';
import type { MenuAction } from '@/components/atoms/menu-button';
import { Text } from '@/components/atoms/text';
import { CardGrid } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { EmptyState } from '@/components/molecules/empty-state';
import { EmptyBinderSlots } from '@/components/molecules/empty-state-illustrations';
import { SheetSection } from '@/components/molecules/sheet-section';
import {
  deckCommanders,
  isBasicLandTile,
  mainDeckGroups,
  type BasicLandTile,
  type DeckGrouping,
  type DeckOrder,
  type MainDeckCard,
} from '@/decks/deck-groups';
import { violationCardKeys } from '@/decks/violation-cards';

type CardHandlers = {
  onOpenCard: (card: DeckCard) => void;
  menuActionsOf: (card: DeckCard) => MenuAction[];
  basicLandMenuActionsOf: (land: BasicLandTile) => MenuAction[];
};

type DeckCardsProps = CardHandlers & {
  deck: Deck;
  grouping: DeckGrouping;
  order: DeckOrder;
  onOpenCollection: () => void;
};

type DeckCardGridProps = CardHandlers & {
  cards: MainDeckCard[];
  violationKeys: Set<string>;
};

function DeckCardGrid({ cards, violationKeys, onOpenCard, menuActionsOf, basicLandMenuActionsOf }: DeckCardGridProps) {
  return (
    <CardGrid>
      {cards.map((card) =>
        isBasicLandTile(card) ? (
          <CardTile
            key={card.key}
            uri={card.image_uris[0]}
            accessibilityLabel={card.name}
            inViolation={violationKeys.has(card.oracle_id)}
            menuActions={basicLandMenuActionsOf(card)}
          />
        ) : (
          <CardTile
            key={card.copy_id}
            uri={card.image_uris[0]}
            sheen={sheenOf(card.finish)}
            accessibilityLabel={[...spokenCopy(card), ...(card.planned_out ? ['planned out'] : [])].join(', ')}
            inViolation={violationKeys.has(card.copy_id)}
            menuActions={menuActionsOf(card)}
            onPress={() => onOpenCard(card)}>
            {card.planned_out ? (
              <Text variant="meta" numberOfLines={1} className="text-center text-outgoing">
                Planned out
              </Text>
            ) : null}
          </CardTile>
        ),
      )}
    </CardGrid>
  );
}

export function DeckCards({ deck, grouping, order, onOpenCollection, ...handlers }: DeckCardsProps) {
  const commanders = deckCommanders(deck.cards);
  const violationKeys = violationCardKeys(deck.evaluation);
  return (
    <>
      <SheetSection title="Commander" count={commanders.length > 0 ? commanders.length : undefined}>
        {commanders.length > 0 ? (
          <DeckCardGrid cards={commanders} violationKeys={violationKeys} {...handlers} />
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
        mainDeckGroups(deck.cards, deck.basic_lands, grouping, order).map((group) => (
          <SheetSection key={group.title} title={group.title} count={group.cards.length}>
            <DeckCardGrid cards={group.cards} violationKeys={violationKeys} {...handlers} />
          </SheetSection>
        ))
      )}
    </>
  );
}

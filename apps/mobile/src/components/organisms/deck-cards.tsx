import type { Deck, DeckCard } from '@mtgscan/supabase/decks';
import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { sheenOf, spokenCopy } from '@/collection/copy-labels';
import type { MenuAction } from '@/components/atoms/menu-button';
import { Text } from '@/components/atoms/text';
import { cardListRowClass } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { EmptyState } from '@/components/molecules/empty-state';
import { EmptyBinderSlots } from '@/components/molecules/empty-state-illustrations';
import { SheetSectionHeader } from '@/components/molecules/sheet-section';
import {
  deckCommanders,
  isBasicLandTile,
  mainDeckCardKey,
  mainDeckGroups,
  type BasicLandTile,
  type DeckGrouping,
  type DeckOrder,
  type MainDeckCard,
} from '@/decks/deck-groups';

export type DeckCardsItem =
  | { kind: 'heading'; key: string; title: string; count?: number }
  | { kind: 'card'; key: string; card: MainDeckCard }
  | { kind: 'no-commander'; key: string }
  | { kind: 'no-cards'; key: string };

type CardHandlers = {
  onOpenCard: (card: DeckCard) => void;
  menuActionsOf: (card: DeckCard) => MenuAction[];
  basicLandMenuActionsOf: (land: BasicLandTile) => MenuAction[];
};

type DeckCardsItemViewProps = CardHandlers & {
  item: DeckCardsItem;
  violationKeys: Set<string>;
  onOpenCollection: () => void;
};

const commanderTitle = 'Commander';

const itemSpacing = cva('', {
  variants: {
    kind: {
      heading: [cardListRowClass, 'pt-lg'],
      'no-cards': [cardListRowClass, 'pt-lg'],
      card: 'pt-sm',
      'no-commander': [cardListRowClass, 'pt-sm'],
    },
  },
});

function cardItems(cards: MainDeckCard[]): DeckCardsItem[] {
  return cards.map((card) => ({ kind: 'card', key: mainDeckCardKey(card), card }));
}

export function deckCardsItems(deck: Deck, grouping: DeckGrouping, order: DeckOrder): DeckCardsItem[] {
  const commanders = deckCommanders(deck.cards);
  const commanderItems: DeckCardsItem[] = [
    { kind: 'heading', key: commanderTitle, title: commanderTitle, count: commanders.length > 0 ? commanders.length : undefined },
    ...(commanders.length > 0 ? cardItems(commanders) : [{ kind: 'no-commander' as const, key: 'no-commander' }]),
  ];
  if (deck.card_count === 0) {
    return [...commanderItems, { kind: 'no-cards', key: 'no-cards' }];
  }
  return [
    ...commanderItems,
    ...mainDeckGroups(deck.cards, deck.basic_lands, grouping, order).flatMap((group): DeckCardsItem[] => [
      { kind: 'heading', key: group.title, title: group.title, count: group.cards.length },
      ...cardItems(group.cards),
    ]),
  ];
}

function DeckCardTile({ card, violationKeys, onOpenCard, menuActionsOf, basicLandMenuActionsOf }: CardHandlers & { card: MainDeckCard; violationKeys: Set<string> }) {
  if (isBasicLandTile(card)) {
    return (
      <CardTile
        uri={card.image_uris[0]}
        accessibilityLabel={card.name}
        inViolation={violationKeys.has(card.oracle_id)}
        menuActions={basicLandMenuActionsOf(card)}
      />
    );
  }
  return (
    <CardTile
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
  );
}

function itemContent({ item, onOpenCollection, ...tileProps }: DeckCardsItemViewProps) {
  switch (item.kind) {
    case 'heading':
      return <SheetSectionHeader title={item.title} count={item.count} />;
    case 'card':
      return <DeckCardTile card={item.card} {...tileProps} />;
    case 'no-commander':
      return <Text className="text-text-muted">No commander yet.</Text>;
    case 'no-cards':
      return (
        <EmptyState
          illustration={<EmptyBinderSlots rows={1} />}
          title="No cards yet"
          message="Add cards from a copy's page in your collection."
          action={{ label: 'Open Collection', onPress: onOpenCollection }}
        />
      );
  }
}

export function DeckCardsItemView(props: DeckCardsItemViewProps) {
  return <View className={itemSpacing({ kind: props.item.kind })}>{itemContent(props)}</View>;
}

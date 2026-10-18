import type { Deck, DeckCard } from '@mtgscan/supabase/decks';
import { cva } from 'class-variance-authority';
import { View } from 'react-native';

import { sheenOf, spokenCopy } from '@/collection/copy-labels';
import type { MenuAction } from '@/components/atoms/menu-button';
import { Text } from '@/components/atoms/text';
import { CardGrid, inCardRows } from '@/components/molecules/card-grid';
import { CardTile } from '@/components/molecules/card-tile';
import { EmptyState } from '@/components/molecules/empty-state';
import { EmptyBinderSlots } from '@/components/molecules/empty-state-illustrations';
import { SheetSectionHeader } from '@/components/molecules/sheet-section';
import {
  deckCommanders,
  isBasicLandTile,
  mainDeckGroups,
  type BasicLandTile,
  type DeckGrouping,
  type DeckOrder,
  type MainDeckCard,
} from '@/decks/deck-groups';

export type DeckCardsRow =
  | { kind: 'heading'; key: string; title: string; count?: number }
  | { kind: 'cards'; key: string; cards: MainDeckCard[] }
  | { kind: 'no-commander'; key: string }
  | { kind: 'no-cards'; key: string };

type CardHandlers = {
  onOpenCard: (card: DeckCard) => void;
  menuActionsOf: (card: DeckCard) => MenuAction[];
  basicLandMenuActionsOf: (land: BasicLandTile) => MenuAction[];
};

type DeckCardsRowViewProps = CardHandlers & {
  row: DeckCardsRow;
  violationKeys: Set<string>;
  onOpenCollection: () => void;
};

const commanderTitle = 'Commander';

const rowSpacing = cva('px-lg', {
  variants: {
    kind: { heading: 'pt-lg', 'no-cards': 'pt-lg', cards: 'pt-sm', 'no-commander': 'pt-sm' },
  },
});

function cardRows(title: string, cards: MainDeckCard[]): DeckCardsRow[] {
  return inCardRows(cards).map((rowCards, row) => ({ kind: 'cards', key: `${title}:${row}`, cards: rowCards }));
}

export function deckCardsRows(deck: Deck, grouping: DeckGrouping, order: DeckOrder): DeckCardsRow[] {
  const commanders = deckCommanders(deck.cards);
  const commanderRows: DeckCardsRow[] = [
    { kind: 'heading', key: commanderTitle, title: commanderTitle, count: commanders.length > 0 ? commanders.length : undefined },
    ...(commanders.length > 0 ? cardRows(commanderTitle, commanders) : [{ kind: 'no-commander' as const, key: 'no-commander' }]),
  ];
  if (deck.card_count === 0) {
    return [...commanderRows, { kind: 'no-cards', key: 'no-cards' }];
  }
  return [
    ...commanderRows,
    ...mainDeckGroups(deck.cards, deck.basic_lands, grouping, order).flatMap((group): DeckCardsRow[] => [
      { kind: 'heading', key: group.title, title: group.title, count: group.cards.length },
      ...cardRows(group.title, group.cards),
    ]),
  ];
}

function DeckCardTiles({ cards, violationKeys, onOpenCard, menuActionsOf, basicLandMenuActionsOf }: CardHandlers & { cards: MainDeckCard[]; violationKeys: Set<string> }) {
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

function rowContent({ row, onOpenCollection, ...tileProps }: DeckCardsRowViewProps) {
  switch (row.kind) {
    case 'heading':
      return <SheetSectionHeader title={row.title} count={row.count} />;
    case 'cards':
      return <DeckCardTiles cards={row.cards} {...tileProps} />;
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

export function DeckCardsRowView(props: DeckCardsRowViewProps) {
  return <View className={rowSpacing({ kind: props.row.kind })}>{rowContent(props)}</View>;
}

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
import { Stepper } from '@/components/molecules/stepper';
import { basicLandCountLimit, basicLandTotal, catalogBasicLands, type BasicLandDraft } from '@/decks/basic-lands';
import { deckCommanders, mainDeckGroups, type DeckGrouping, type DeckOrder } from '@/decks/deck-groups';

type BasicLandEdit = {
  draft: BasicLandDraft | null;
  onEdit: () => void;
  onChange: (oracleId: string, count: number) => void;
};

type CardHandlers = {
  onOpenCard: (card: DeckCard) => void;
  menuActionsOf: (card: DeckCard) => MenuAction[];
};

type DeckCardsProps = CardHandlers & {
  deck: Deck;
  grouping: DeckGrouping;
  order: DeckOrder;
  basicLandEdit: BasicLandEdit;
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

function BasicLands({ lands, edit }: { lands: DeckBasicLand[]; edit: BasicLandEdit }) {
  const total = basicLandTotal(lands);
  const { draft } = edit;
  const shownLands = lands.filter((land) => land.count > 0);

  return (
    <SheetSection
      title="Basic lands"
      count={total > 0 ? total : undefined}
      action={
        draft ? undefined : (
          <Button onPress={edit.onEdit}>
            <Text>Edit</Text>
          </Button>
        )
      }>
      {draft ? (
        <CardGrid>
          {catalogBasicLands(lands).map((land) => (
            <CardTile
              key={land.name}
              uri={land.image_uris[0]}
              accessibilityLabel={land.name}
              control={
                <Stepper
                  label={land.name}
                  value={draft[land.oracle_id]!}
                  min={0}
                  max={basicLandCountLimit}
                  onChange={(count) => edit.onChange(land.oracle_id, count)}
                />
              }
            />
          ))}
        </CardGrid>
      ) : null}
      {!draft && shownLands.length > 0 ? (
        <CardGrid>
          {shownLands.map((land) => (
            <CardTile
              key={land.name}
              uri={land.image_uris[0]}
              count={land.count}
              accessibilityLabel={`${land.name}, ${land.count}`}
            />
          ))}
        </CardGrid>
      ) : null}
    </SheetSection>
  );
}

export function DeckCards({ deck, grouping, order, basicLandEdit, onOpenCard, menuActionsOf, onOpenCollection }: DeckCardsProps) {
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
      <BasicLands lands={deck.basic_lands} edit={basicLandEdit} />
    </>
  );
}

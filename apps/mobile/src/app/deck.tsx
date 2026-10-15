import { deckNameLength, type Deck, type DeckCard, type DeckChange, type DeckPriority } from '@mtgscan/supabase/decks';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { NameAlert } from '@/components/atoms/name-alert';
import { DeckBanner } from '@/components/molecules/commander-card';
import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { ToggleGroup } from '@/components/molecules/toggle-group';
import { deckActionsMenu } from '@/components/organisms/deck-actions-menu';
import { DeckCardOrderButtons } from '@/components/organisms/deck-card-order-buttons';
import { DeckCards } from '@/components/organisms/deck-cards';
import { DeckHistory } from '@/components/organisms/deck-history';
import { PushedScreen } from '@/components/templates/pushed-screen';
import { applyCommanderAction, commanderAction } from '@/decks/commander-actions';
import { useDeckCardOrder } from '@/decks/deck-card-order';
import { cardCountLabel, deckChips } from '@/decks/deck-labels';
import { backToGallery, showDeckWriteResult } from '@/decks/deck-write-result';
import { deleteDeck, markDeckUsed, renameDeck, setDeckPriority } from '@/decks/deck-writes';
import { removeFromDeck } from '@/decks/remove-from-deck';
import { useDeck } from '@/decks/use-deck';
import { useDeckChanges } from '@/decks/use-deck-changes';
import { colors } from '@/theme';

const deckTabs = ['cards', 'history'] as const;

type DeckTab = (typeof deckTabs)[number];

const deckTabLabels: Record<DeckTab, string> = { cards: 'Cards', history: 'History' };

function deleteMessage(cardCount: number) {
  const verb = cardCount === 1 ? 'becomes' : 'become';
  return `Its ${cardCountLabel(cardCount)} ${verb} free, and its history is deleted. This cannot be undone.`;
}

function openCard(card: DeckCard) {
  router.push({ pathname: '/copy', params: { copyId: card.copy_id } });
}

function openRevert(deck: Deck, change: DeckChange) {
  router.push({
    pathname: '/revert',
    params: { deckId: deck.deck_id, deckName: deck.name, deckChangeId: change.deck_change_id, kind: change.kind, changeRevision: change.revision },
  });
}

export default function DeckScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { read, reload } = useDeck(deckId);
  const { history, tryAgain: tryHistoryAgain, loadMore } = useDeckChanges(deckId, read.status === 'loaded' ? read.deck.revision : null);
  const [tab, setTab] = useState<DeckTab>('cards');
  const [renaming, setRenaming] = useState(false);
  const { grouping, order, setGrouping, setOrder } = useDeckCardOrder();
  const showsCardOrderButtons = tab === 'cards' && read.status === 'loaded' && read.deck.card_count > 0;

  useEffect(() => {
    void markDeckUsed(deckId);
  }, [deckId]);

  function rename(name: string) {
    return showDeckWriteResult(renameDeck(deckId, name), 'Could not rename this deck', reload);
  }

  function changePriority(priority: DeckPriority) {
    return showDeckWriteResult(setDeckPriority(deckId, priority), 'Could not change the deck priority', reload);
  }

  function deleteThisDeck() {
    return showDeckWriteResult(deleteDeck(deckId), 'Could not delete this deck', backToGallery);
  }

  function menuActionsOf(deck: Deck) {
    return (card: DeckCard) => {
      const action = commanderAction(card.role, deck.commanders.length);
      return [
        { title: 'Open card', onSelect: () => openCard(card) },
        ...(action ? [{ title: action.title, onSelect: () => void applyCommanderAction(card.copy_id, action, reload) }] : []),
        { title: 'Remove from deck', destructive: true, onSelect: () => void removeFromDeck(card.copy_id, reload) },
      ];
    };
  }

  function confirmDelete(deck: Deck) {
    Alert.alert(`Delete ${deck.name}?`, deleteMessage(deck.card_count), [
      { text: 'Delete deck', style: 'destructive', onPress: deleteThisDeck },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <PushedScreen
      onEndReached={tab === 'history' ? loadMore : undefined}
      floatingButtons={
        showsCardOrderButtons ? (
          <DeckCardOrderButtons grouping={grouping} order={order} onChangeGrouping={setGrouping} onChangeOrder={setOrder} />
        ) : null
      }>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" tintColor={colors.text} accessibilityLabel="Close" onPress={() => router.back()} />
      </Stack.Toolbar>
      {read.status === 'loaded' ? (
        <>
          <Stack.Toolbar placement="right">
            {deckActionsMenu({
              priority: read.deck.priority,
              onRename: () => setRenaming(true),
              onSetPriority: changePriority,
              onDelete: () => confirmDelete(read.deck),
            })}
          </Stack.Toolbar>
          {renaming ? (
            <NameAlert
              title="Rename deck"
              message="Name your deck."
              placeholder="Deck name"
              confirmLabel="Save"
              maxLength={deckNameLength}
              initialName={read.deck.name}
              onConfirm={rename}
              onClose={() => setRenaming(false)}
            />
          ) : null}
          <DeckBanner name={read.deck.name} chips={deckChips(read.deck)} commanders={read.deck.commanders} />
          <View className="gap-lg px-lg">
            <ToggleGroup values={deckTabs} selected={tab} labelOf={(value) => deckTabLabels[value]} onSelect={setTab} />
            {tab === 'cards' ? (
              <DeckCards
                deck={read.deck}
                grouping={grouping}
                order={order}
                onEditBasicLands={() => router.push({ pathname: '/basic-lands', params: { deckId } })}
                onOpenCard={openCard}
                menuActionsOf={menuActionsOf(read.deck)}
                onOpenCollection={() => router.dismissTo('/collection')}
              />
            ) : null}
            {tab === 'history' && history.status === 'loaded' ? (
              <DeckHistory changes={history.changes} createdAt={read.deck.created_at} onRevert={(change) => openRevert(read.deck, change)} />
            ) : null}
            {tab === 'history' && history.status === 'failed' ? (
              <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this deck" onTryAgain={tryHistoryAgain} />
            ) : null}
          </View>
        </>
      ) : null}
      {read.status === 'failed' ? (
        <View className="px-lg pt-safe-offset-xl">
          <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this deck" onTryAgain={reload} />
        </View>
      ) : null}
    </PushedScreen>
  );
}

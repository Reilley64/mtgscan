import { deckNameLength, type Deck, type DeckCard, type DeckPriority } from '@mtgscan/supabase/decks';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { NameAlert } from '@/components/atoms/name-alert';
import { Text } from '@/components/atoms/text';
import { CommanderCard } from '@/components/molecules/commander-card';
import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { SaveBar } from '@/components/molecules/save-bar';
import { ToggleGroup } from '@/components/molecules/toggle-group';
import { deckActionsMenu } from '@/components/organisms/deck-actions-menu';
import { DeckCardOrderButtons } from '@/components/organisms/deck-card-order-buttons';
import { DeckCards } from '@/components/organisms/deck-cards';
import { DeckHistory } from '@/components/organisms/deck-history';
import { PushedScreen } from '@/components/templates/pushed-screen';
import { basicLandDraftOf, changedBasicLands, type BasicLandDraft } from '@/decks/basic-lands';
import { applyCommanderAction, commanderAction } from '@/decks/commander-actions';
import { useDeckCardOrder } from '@/decks/deck-card-order';
import { cardCountLabel, deckChips } from '@/decks/deck-labels';
import { deleteDeck, markDeckUsed, renameDeck, setBasicLands, setDeckPriority } from '@/decks/deck-writes';
import { removeFromDeck } from '@/decks/remove-from-deck';
import { useDeck } from '@/decks/use-deck';
import { useDeckChanges } from '@/decks/use-deck-changes';
import type { WriteResult } from '@/lib/write-result';
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

function backToGallery() {
  router.dismissTo('/decks');
}

async function showWriteResult(write: Promise<WriteResult>, failureTitle: string, onDone: () => void) {
  const result = await write;
  if (result === 'failed') {
    Alert.alert(failureTitle, 'Check your connection.');
  } else if (result === 'missing') {
    backToGallery();
  } else {
    onDone();
  }
}

export default function DeckScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { read, reload } = useDeck(deckId);
  const { history, tryAgain: tryHistoryAgain, loadMore } = useDeckChanges(deckId, read.status === 'loaded' ? read.deck.revision : null);
  const [tab, setTab] = useState<DeckTab>('cards');
  const [renaming, setRenaming] = useState(false);
  const [basicLandDraft, setBasicLandDraft] = useState<BasicLandDraft | null>(null);
  const [savingBasicLands, setSavingBasicLands] = useState(false);
  const { grouping, order, setGrouping, setOrder } = useDeckCardOrder();
  const showsCardOrderButtons = tab === 'cards' && read.status === 'loaded' && read.deck.card_count > 0 && !basicLandDraft;

  useEffect(() => {
    void markDeckUsed(deckId);
  }, [deckId]);

  function rename(name: string) {
    return showWriteResult(renameDeck(deckId, name), 'Could not rename this deck', reload);
  }

  function changePriority(priority: DeckPriority) {
    return showWriteResult(setDeckPriority(deckId, priority), 'Could not change the deck priority', reload);
  }

  function deleteThisDeck() {
    return showWriteResult(deleteDeck(deckId), 'Could not delete this deck', backToGallery);
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

  async function saveBasicLands(deck: Deck, draft: BasicLandDraft) {
    setSavingBasicLands(true);
    await showWriteResult(
      setBasicLands({ deck_id: deckId, counts: changedBasicLands(deck.basic_lands, draft) }),
      'Could not save the basic lands',
      () => {
        setBasicLandDraft(null);
        reload();
      },
    );
    setSavingBasicLands(false);
  }

  function confirmDelete(deck: Deck) {
    Alert.alert(`Delete ${deck.name}?`, deleteMessage(deck.card_count), [
      { text: 'Delete deck', style: 'destructive', onPress: deleteThisDeck },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const basicLandFooter =
    read.status === 'loaded' && tab === 'cards' && basicLandDraft ? (
      <SaveBar
        changeCount={changedBasicLands(read.deck.basic_lands, basicLandDraft).length}
        saving={savingBasicLands}
        onCancel={() => setBasicLandDraft(null)}
        onSave={() => saveBasicLands(read.deck, basicLandDraft)}
      />
    ) : undefined;

  return (
    <PushedScreen
      footer={basicLandFooter}
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
          <View className="px-lg pt-safe-offset-xl">
            <CommanderCard name={read.deck.name} chips={deckChips(read.deck)} commanders={read.deck.commanders} size="banner" />
          </View>
          <View className="gap-lg px-lg">
            <ToggleGroup values={deckTabs} selected={tab} labelOf={(value) => deckTabLabels[value]} onSelect={setTab} />
            {tab === 'cards' ? (
              <DeckCards
                deck={read.deck}
                grouping={grouping}
                order={order}
                basicLandEdit={{
                  draft: basicLandDraft,
                  onEdit: () => setBasicLandDraft(basicLandDraftOf(read.deck.basic_lands)),
                  onChange: (oracleId, count) => setBasicLandDraft((draft) => draft && { ...draft, [oracleId]: count }),
                }}
                onOpenCard={openCard}
                menuActionsOf={menuActionsOf(read.deck)}
                onOpenCollection={() => router.dismissTo('/collection')}
              />
            ) : null}
            {tab === 'history' && history.status === 'loaded' ? (
              <DeckHistory changes={history.changes} createdAt={read.deck.created_at} />
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

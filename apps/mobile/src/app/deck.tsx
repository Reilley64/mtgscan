import { deckNameLength, type Deck, type DeckPriority } from '@mtgscan/supabase/decks';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { NameAlert } from '@/components/atoms/name-alert';
import { Text } from '@/components/atoms/text';
import { CommanderCard } from '@/components/molecules/commander-card';
import { DashedCardFrame } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { ToggleGroup } from '@/components/molecules/toggle-group';
import { deckActionsMenu } from '@/components/organisms/deck-actions-menu';
import { DeckCardOrderButtons, DeckCards } from '@/components/organisms/deck-cards';
import { PushedScreen } from '@/components/templates/pushed-screen';
import { useDeckCardOrder } from '@/decks/deck-card-order';
import { cardCountLabel, deckChips } from '@/decks/deck-labels';
import { deleteDeck, markDeckUsed, renameDeck, setDeckPriority } from '@/decks/deck-writes';
import { useDeck } from '@/decks/use-deck';
import type { WriteResult } from '@/lib/write-result';
import { shownDay } from '@/lib/shown-day';
import { colors } from '@/theme';

const deckTabs = ['cards', 'history'] as const;

type DeckTab = (typeof deckTabs)[number];

const deckTabLabels: Record<DeckTab, string> = { cards: 'Cards', history: 'History' };

function deleteMessage(cardCount: number) {
  const verb = cardCount === 1 ? 'becomes' : 'become';
  return `Its ${cardCountLabel(cardCount)} ${verb} free, and its history is deleted. This cannot be undone.`;
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
  const [tab, setTab] = useState<DeckTab>('cards');
  const [renaming, setRenaming] = useState(false);
  const { grouping, order, setGrouping, setOrder } = useDeckCardOrder();
  const showsCardOrderButtons = tab === 'cards' && read.status === 'loaded' && read.deck.card_count > 0;

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

  function confirmDelete(deck: Deck) {
    Alert.alert(`Delete ${deck.name}?`, deleteMessage(deck.card_count), [
      { text: 'Delete deck', style: 'destructive', onPress: deleteThisDeck },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <PushedScreen
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
            <CommanderCard name={read.deck.name} chips={deckChips(read.deck)} size="banner" />
          </View>
          <View className="gap-lg px-lg">
            <ToggleGroup values={deckTabs} selected={tab} labelOf={(value) => deckTabLabels[value]} onSelect={setTab} />
            {tab === 'cards' ? (
              <DeckCards
                deck={read.deck}
                grouping={grouping}
                order={order}
                onOpenCard={(card) => router.push({ pathname: '/copy', params: { copyId: card.copy_id } })}
                onOpenCollection={() => router.dismissTo('/collection')}
              />
            ) : null}
            {tab === 'history' ? <Text variant="meta">Created {shownDay(read.deck.created_at)}</Text> : null}
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

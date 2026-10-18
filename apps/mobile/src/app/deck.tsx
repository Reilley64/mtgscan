import { deckNameLength, type Deck, type DeckCard, type DeckChange, type DeckPriority } from '@mtgscan/supabase/decks';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { NameAlert } from '@/components/atoms/name-alert';
import { DeckBanner } from '@/components/molecules/commander-card';
import { EmptyState } from '@/components/molecules/empty-state';
import { DashedCardFrame, GhostNeedsYouItems } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { ToggleGroup } from '@/components/molecules/toggle-group';
import { deckActionsMenu } from '@/components/organisms/deck-actions-menu';
import { DeckCardOrderButtons } from '@/components/organisms/deck-card-order-buttons';
import { DeckCardsRowView, deckCardsRows, type DeckCardsRow } from '@/components/organisms/deck-cards';
import { DeckHistory } from '@/components/organisms/deck-history';
import { DeckSkeleton } from '@/components/organisms/deck-skeleton';
import { NeedsYouList } from '@/components/organisms/needs-you-list';
import { SwapInAllButton } from '@/components/organisms/swap-in-all-button';
import { PushedListScreen } from '@/components/templates/pushed-screen';
import { applyCommanderAction, commanderAction } from '@/decks/commander-actions';
import { useDeckCardOrder } from '@/decks/deck-card-order';
import type { BasicLandTile } from '@/decks/deck-groups';
import { cardCountLabel, deckChips, estimatedBracketChip, validityChip } from '@/decks/deck-labels';
import { backToGallery, showDeckWriteResult } from '@/decks/deck-write-result';
import { deleteDeck, markDeckUsed, renameDeck, setDeckPriority } from '@/decks/deck-writes';
import { removeBasicLandFromDeck, removeFromDeck } from '@/decks/remove-from-deck';
import { useDeck } from '@/decks/use-deck';
import { useDeckChanges } from '@/decks/use-deck-changes';
import { violationCardKeys } from '@/decks/violation-cards';
import { useNeedsYouCounts } from '@/needs-you/needs-you-counts';
import { useNeedsYou, type NeedsYouItem } from '@/needs-you/use-needs-you';
import { colors } from '@/theme';

const deckTabs = ['cards', 'planned', 'history'] as const;

type DeckTab = (typeof deckTabs)[number];

const deckTabLabels: Record<DeckTab, string> = { cards: 'Cards', planned: 'Planned', history: 'History' };

type DeckScreenItem = DeckCardsRow | { kind: Exclude<DeckTab, 'cards'>; key: string };

function deleteMessage(cardCount: number) {
  const verb = cardCount === 1 ? 'becomes' : 'become';
  return `Its ${cardCountLabel(cardCount)} ${verb} free, and its history is deleted. This cannot be undone.`;
}

function plannedSwapsOf(items: NeedsYouItem[]) {
  return items.flatMap((item) => (item.kind === 'planned_swap' ? [item.plan] : []));
}

function openCard(card: DeckCard) {
  router.push({ pathname: '/copy', params: { copyId: card.copy_id } });
}

function evaluationChipButtons(deck: Deck) {
  if (!deck.evaluation) {
    return [];
  }
  const chip = validityChip(deck.evaluation);
  return [
    {
      ...chip,
      accessibilityLabel: `Deck validity, ${chip.label}`,
      onPress: () => router.push({ pathname: '/deck-validity', params: { deckId: deck.deck_id } }),
    },
    {
      ...estimatedBracketChip(deck.evaluation),
      onPress: () => router.push({ pathname: '/estimated-bracket', params: { deckId: deck.deck_id } }),
    },
  ];
}

function openRevert(deck: Deck, change: DeckChange) {
  router.push({
    pathname: '/revert',
    params: { deckId: deck.deck_id, deckName: deck.name, deckChangeId: change.deck_change_id, kind: change.kind, changeRevision: change.revision },
  });
}

export default function DeckScreen() {
  const params = useLocalSearchParams<{ deckId: string; tab?: string }>();
  const { deckId } = params;
  const { read, reload } = useDeck(deckId);
  const { history, tryAgain: tryHistoryAgain, loadMore } = useDeckChanges(deckId, read.status === 'loaded' ? read.deck.revision : null);
  const { read: planned, reload: reloadPlanned } = useNeedsYou(deckId);
  const { countOf } = useNeedsYouCounts();
  const [tab, setTab] = useState<DeckTab>(() => deckTabs.find((value) => value === params.tab) ?? 'cards');
  const [renaming, setRenaming] = useState(false);
  const { grouping, order, setGrouping, setOrder } = useDeckCardOrder();
  const showsCardOrderButtons = tab === 'cards' && read.status === 'loaded' && read.deck.card_count > 0;

  useEffect(() => {
    void markDeckUsed(deckId);
  }, [deckId]);

  function reloadAfterPlanChange() {
    reload();
    reloadPlanned();
  }

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

  function basicLandMenuActionsOf(land: BasicLandTile) {
    return [{ title: 'Remove from deck', destructive: true, onSelect: () => void removeBasicLandFromDeck(deckId, land.oracle_id, reload) }];
  }

  function confirmDelete(deck: Deck) {
    Alert.alert(`Delete ${deck.name}?`, deleteMessage(deck.card_count), [
      { text: 'Delete deck', style: 'destructive', onPress: deleteThisDeck },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const deck = read.status === 'loaded' ? read.deck : null;
  const violationKeys = violationCardKeys(deck?.evaluation ?? null);
  const items: DeckScreenItem[] = !deck ? [] : tab === 'cards' ? deckCardsRows(deck, grouping, order) : [{ kind: tab, key: tab }];

  function plannedContent() {
    if (planned.status === 'failed') {
      return <ReadFailure illustration={<GhostNeedsYouItems />} title="Could not load this deck" onTryAgain={reloadPlanned} />;
    }
    if (planned.status === 'loading') {
      return null;
    }
    if (planned.items.length === 0) {
      return (
        <EmptyState
          illustration={<GhostNeedsYouItems />}
          title="Nothing planned yet"
          message="Planned swaps and buylist cards for this deck show up here."
        />
      );
    }
    return (
      <>
        {plannedSwapsOf(planned.items).length >= 2 ? (
          <SwapInAllButton deckId={deckId} plannedSwaps={plannedSwapsOf(planned.items)} onChanged={reloadAfterPlanChange} />
        ) : null}
        <NeedsYouList items={planned.items} onChanged={reloadAfterPlanChange} />
      </>
    );
  }

  function historyContent(deck: Deck) {
    if (history.status === 'failed') {
      return <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this deck" onTryAgain={tryHistoryAgain} />;
    }
    if (history.status === 'loading') {
      return null;
    }
    return <DeckHistory changes={history.changes} createdAt={deck.created_at} onRevert={(change) => openRevert(deck, change)} />;
  }

  function header() {
    if (read.status === 'loading') {
      return <DeckSkeleton showsCards={tab === 'cards'} />;
    }
    if (read.status === 'failed') {
      return (
        <View className="px-lg pt-safe-offset-xl">
          <ReadFailure illustration={<DashedCardFrame symbol="wifi.slash" />} title="Could not load this deck" onTryAgain={reload} />
        </View>
      );
    }
    return (
      <>
        <DeckBanner
          name={read.deck.name}
          chips={deckChips(read.deck).map((label) => ({ label }))}
          chipButtons={evaluationChipButtons(read.deck)}
          commanders={read.deck.commanders}
        />
        <View className="px-lg pt-lg">
          <ToggleGroup
            values={deckTabs}
            selected={tab}
            labelOf={(value) => deckTabLabels[value]}
            countOf={(value) => (value === 'planned' ? countOf(deckId) : 0)}
            onSelect={setTab}
          />
        </View>
      </>
    );
  }

  function itemView(item: DeckScreenItem, deck: Deck) {
    switch (item.kind) {
      case 'planned':
        return <View className="gap-lg px-lg pt-lg">{plannedContent()}</View>;
      case 'history':
        return <View className="gap-lg px-lg pt-lg">{historyContent(deck)}</View>;
      default:
        return (
          <DeckCardsRowView
            row={item}
            violationKeys={violationKeys}
            onOpenCard={openCard}
            menuActionsOf={menuActionsOf(deck)}
            basicLandMenuActionsOf={basicLandMenuActionsOf}
            onOpenCollection={() => router.dismissTo('/collection')}
          />
        );
    }
  }

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" tintColor={colors.text} accessibilityLabel="Close" onPress={() => router.back()} />
      </Stack.Toolbar>
      {deck ? (
        <Stack.Toolbar placement="right">
          {deckActionsMenu({
            priority: deck.priority,
            onRename: () => setRenaming(true),
            onSetPriority: changePriority,
            onDelete: () => confirmDelete(deck),
          })}
        </Stack.Toolbar>
      ) : null}
      {deck && renaming ? (
        <NameAlert
          title="Rename deck"
          message="Name your deck."
          placeholder="Deck name"
          confirmLabel="Save"
          maxLength={deckNameLength}
          initialName={deck.name}
          onConfirm={rename}
          onClose={() => setRenaming(false)}
        />
      ) : null}
      <PushedListScreen
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (deck ? itemView(item, deck) : null)}
        ListHeaderComponent={header()}
        onEndReached={tab === 'history' ? loadMore : undefined}
        floatingButtons={
          showsCardOrderButtons ? (
            <DeckCardOrderButtons grouping={grouping} order={order} onChangeGrouping={setGrouping} onChangeOrder={setOrder} />
          ) : null
        }
      />
    </>
  );
}

import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/atoms/text';
import { CommanderCard } from '@/components/molecules/commander-card';
import { EmptyState } from '@/components/molecules/empty-state';
import { DashedCardFrame, EmptyBinderSlots } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { SheetSection } from '@/components/molecules/sheet-section';
import { ToggleGroup } from '@/components/molecules/toggle-group';
import { PushedScreen } from '@/components/templates/pushed-screen';
import { deckChips } from '@/decks/deck-labels';
import { markDeckUsed } from '@/decks/deck-writes';
import { useDeck } from '@/decks/use-deck';
import { shownDay } from '@/lib/shown-day';
import { colors } from '@/theme';

const deckTabs = ['cards', 'history'] as const;

type DeckTab = (typeof deckTabs)[number];

const deckTabLabels: Record<DeckTab, string> = { cards: 'Cards', history: 'History' };

function EmptyCards() {
  return (
    <>
      <SheetSection title="Commander">
        <Text className="text-text-muted">No commander yet.</Text>
      </SheetSection>
      <EmptyState
        illustration={<EmptyBinderSlots rows={1} />}
        title="No cards yet"
        message="Add cards from a copy's page in your collection."
        action={{ label: 'Open Collection', onPress: () => router.dismissTo('/collection') }}
      />
    </>
  );
}

export default function DeckScreen() {
  const { deckId } = useLocalSearchParams<{ deckId: string }>();
  const { read, reload } = useDeck(deckId);
  const [tab, setTab] = useState<DeckTab>('cards');

  useEffect(() => {
    void markDeckUsed(deckId);
  }, [deckId]);

  return (
    <PushedScreen>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon="xmark" tintColor={colors.text} accessibilityLabel="Close" onPress={() => router.back()} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="ellipsis" tintColor={colors.text} accessibilityLabel="More" disabled />
      </Stack.Toolbar>
      {read.status === 'loaded' ? (
        <>
          <View className="px-lg pt-safe-offset-xl">
            <CommanderCard name={read.deck.name} chips={deckChips(read.deck)} size="banner" />
          </View>
          <View className="gap-lg px-lg">
            <ToggleGroup values={deckTabs} selected={tab} labelOf={(value) => deckTabLabels[value]} onSelect={setTab} />
            {tab === 'cards' && read.deck.card_count === 0 ? <EmptyCards /> : null}
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

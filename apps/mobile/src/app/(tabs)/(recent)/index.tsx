import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { EmptyState } from '@/components/molecules/empty-state';
import { GhostNeedsYouItems } from '@/components/molecules/empty-state-illustrations';
import { ReadFailure } from '@/components/molecules/read-failure';
import { PlannedSwapCard } from '@/components/organisms/planned-swap-card';
import { TabScreen } from '@/components/templates/tab-screen';
import { swapInPlannedSwap } from '@/planned-swaps/planned-swap-writes';
import { useNeedsYou } from '@/planned-swaps/use-needs-you';

export default function RecentScreen() {
  const { read, reload } = useNeedsYou();
  const [swappingIn, setSwappingIn] = useState<string | null>(null);

  async function swapIn(plannedSwapId: string) {
    setSwappingIn(plannedSwapId);
    const result = await swapInPlannedSwap(plannedSwapId);
    setSwappingIn(null);
    if (result === 'failed') {
      Alert.alert('Could not swap in this card', 'Check your connection.');
    } else if (result === 'commander_limit') {
      Alert.alert('Could not swap in this card', 'A deck has at most two commanders.');
    } else {
      reload();
    }
  }

  return (
    <TabScreen title="Recent">
      {read.status === 'failed' ? (
        <ReadFailure illustration={<GhostNeedsYouItems />} title="Could not load Recent" onTryAgain={reload} />
      ) : null}
      {read.status === 'loaded' && read.plannedSwaps.length === 0 ? (
        <EmptyState
          illustration={<GhostNeedsYouItems />}
          title="Nothing needs you yet"
          message="When a deck needs you, it shows up here."
        />
      ) : null}
      {read.status === 'loaded'
        ? read.plannedSwaps.map((plannedSwap) => (
            <PlannedSwapCard
              key={plannedSwap.planned_swap_id}
              plannedSwap={plannedSwap}
              swappingIn={swappingIn === plannedSwap.planned_swap_id}
              onOpenDeck={() => router.push({ pathname: '/deck', params: { deckId: plannedSwap.deck_id } })}
              onSwapIn={() => void swapIn(plannedSwap.planned_swap_id)}
            />
          ))
        : null}
    </TabScreen>
  );
}
